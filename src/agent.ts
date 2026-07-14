/**
 * Vexi agent: first-run onboarding (BYOK) + interactive chat loop.
 *
 * Phase 2 additions:
 * - Full project understanding: the scanner maps the codebase on startup
 *   and a compact summary is injected into every AI prompt.
 * - Context Compression Engine: older messages are folded into a running
 *   summary in .vexi/memory.json instead of being deleted.
 * - Custom Skills: .vexi/skills/*.md conventions are injected into the
 *   system prompt.
 *
 * Phase 4 additions:
 * - MCP client: tools from servers configured in ~/.vexi/mcp.json are
 *   offered to the model (text-based tool calls, provider-agnostic) and
 *   executed over stdio.
 */

import { basename } from 'node:path';
import { platform } from 'node:os';
import { exec as cpExec } from 'node:child_process';
import { input, select, confirm } from '@inquirer/prompts';
import * as nodeRl from 'node:readline';
import ora from 'ora';

import { loadConfig, saveConfig, CONFIG_PATH, type VexiConfig } from './config.js';
import { SnapshotManager } from './snapshots/index.js';
import {
  createProviderFromConfig,
  detectProvider,
  sanitizeKey,
  refreshManifest,
  PROVIDER_INFO,
  ProviderError,
  type ChatMessage,
  type ProviderId,
} from './providers/index.js';
import { scanProject, projectSummary, type ProjectMap } from './scanner/index.js';
import {
  loadMemory,
  saveMemory,
  memoryBlock,
  compressIntoMemory,
  KEEP_RECENT,
  COMPRESS_INTERVAL,
  type ProjectMemory,
} from './memory/index.js';
import { loadSkills, skillsBlock } from './skills/index.js';
import { SessionRecorder } from './replay/recorder.js';
import { McpManager, parseToolCall } from './mcp/client.js';
import { loadMcpConfig } from './mcp/config.js';
import { parseBuiltinToolCall, executeBuiltinTool, builtinToolsBlock, buildNativeTools, dispatchNativeTool } from './tools/index.js';
import { UsageTracker } from './usage/index.js';
import { ARABIC_RTL_NOTE, getStrings, t, type Lang, type Strings } from './i18n/index.js';
import { gitPush } from './git/index.js';
import { accent, dim, err, ok, printBanner, printStatusLine, userPrompt, vexiLabel, warn } from './ui/index.js';

interface AgentOptions {
  lang: Lang;
  version: string;
  updateCheckPromise?: Promise<string | null>;
}

/** Extract shell commands from fenced code blocks in an AI reply. */
export function extractShellBlocks(reply: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:bash|sh|shell|cmd|powershell|ps1)\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply)) !== null) {
    const code = m[1].trim();
    if (code) blocks.push(code);
  }
  return blocks;
}

/** Hard cap on how long an AI-suggested command may run before it's killed. */
export const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;

/** Run a shell command and return { stdout, stderr, code }. */
export function runCommand(
  cmd: string,
  cwd: string,
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    cpExec(
      cmd,
      {
        cwd,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        maxBuffer: 1024 * 1024 * 4,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      },
      (err, stdout, stderr) => {
        const timedOut = Boolean(err?.killed && err.signal === 'SIGKILL');
        const extraNote = timedOut ? `\n[vexi] command killed after exceeding ${timeoutMs / 1000}s timeout` : '';
        // A killed process has no real exit code (err.code is undefined) — falling back to
        // 0 would look like success to callers, so use the conventional timeout code (124).
        const code = timedOut ? 124 : (err?.code ?? 0);
        resolve({ stdout: stdout ?? '', stderr: (stderr ?? '') + extraNote, code });
      },
    );
  });
}

/**
 * Read a user message with multi-line paste support.
 * Creates a fresh readline interface per call so it never conflicts
 * with inquirer's internal readline. Lines pasted together arrive
 * within ms of each other; a 30 ms debounce collects them all.
 */
function readMessage(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Inquirer may have paused stdin — resume before creating our interface.
    process.stdin.resume();

    const lines: string[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const iface = nodeRl.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      iface.removeListener('line', onLine);
      iface.removeListener('close', onClose);
      iface.close();
      resolve(lines.join('\n'));
    };

    const onLine = (line: string) => {
      lines.push(line);
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, 30);
    };

    const onClose = () => {
      if (!settled) {
        settled = true;
        iface.removeListener('line', onLine);
        reject(Object.assign(new Error('stdin closed'), { name: 'ExitPromptError' }));
      }
    };

    iface.on('SIGINT', () => {
      settled = true;
      iface.close();
      reject(Object.assign(new Error('ExitPromptError'), { name: 'ExitPromptError' }));
    });

    iface.on('line', onLine);
    iface.once('close', onClose);
    process.stdout.write(prompt + ' ');
  });
}

export async function runAgent(opts: AgentOptions): Promise<void> {
  const s = getStrings(opts.lang);

  printBanner(opts.version);
  if (opts.lang === 'ar') {
    console.log(warn(ARABIC_RTL_NOTE) + '\n');
  }

  // ── Load or create config (first-run experience) ──────────────────────
  let config = await loadConfig();
  if (!config) {
    config = await firstRunSetup(s, opts.lang);
  }
  // Persist language override so future runs remember it
  if (config.lang !== opts.lang) {
    config.lang = opts.lang;
    await saveConfig(config);
  }

  let provider = createProviderFromConfig(config);
  const root = process.cwd();

  // Best-effort: refresh the remote model-default manifest for the next run.
  void refreshManifest();

  // ── Full project understanding: scan + load memory + load skills ──────
  const scanSpinner = ora({ text: dim(s.scanning), spinner: 'dots' }).start();
  let project: ProjectMap | null = null;
  try {
    project = await scanProject(root);
    scanSpinner.succeed(dim(t(s.scanned, { files: String(project.fileCount) })));
  } catch {
    scanSpinner.stop(); // scanning is best-effort — chat works without it
  }
  let memory: ProjectMemory = await loadMemory(root);
  const skills = await loadSkills(root);

  // ── MCP client: connect configured external tool servers ────────────
  const mcp = new McpManager();
  const mcpConfig = await loadMcpConfig();
  if (Object.keys(mcpConfig.mcpServers).length > 0) {
    const mcpSpinner = ora({ text: dim(s.mcpConnecting), spinner: 'dots' }).start();
    const { connected, failed } = await mcp.connect();
    mcpSpinner.stop();
    if (connected.length > 0) {
      console.log(dim(t(s.mcpConnected, { servers: connected.join(', '), tools: String(mcp.tools.length) })));
    }
    for (const f of failed) console.log(warn(t(s.mcpFailed, { name: f.name })));
  }

  // ── Snapshot engine: register this session for undo/redo ─────────────
  const snapshotSessionId = Date.now().toString(36);
  const snapshots = new SnapshotManager(root, snapshotSessionId);
  await snapshots.registerAsCurrentSession().catch(() => {});

  // ── Session recording (Vexi Replay) — saved after every turn ─────────
  const providerLabel = config.displayName ?? PROVIDER_INFO[config.provider as ProviderId]?.label ?? config.provider;

  const recorder = new SessionRecorder(root, {
    project: basename(root),
    provider: providerLabel,
    model: provider.model,
    lang: opts.lang,
  });

  printStatusLine({
    project: project?.stack.length
      ? `${basename(root)} (${project.stack.slice(0, 4).join(', ')})`
      : basename(root),
    provider: providerLabel,
    model: provider.model,
    lang: opts.lang,
  });

  if (memory.summary || memory.decisions.length > 0) {
    console.log(dim(t(s.memoryLoaded, { decisions: String(memory.decisions.length) })));
  }
  if (skills.length > 0) {
    console.log(dim(t(s.skillsLoaded, { names: skills.map((sk) => sk.name).join(', ') })));
  }

  // Peek at the update check (only picks up already-resolved results; never blocks)
  const latestVersion = opts.updateCheckPromise
    ? await Promise.race([
        opts.updateCheckPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 0)),
      ])
    : null;
  if (latestVersion) {
    console.log(dim(`Update available: ${opts.version} -> ${latestVersion}   run: npm install -g vexi-cli@latest`));
  }

  console.log(dim(s.chatHint) + '\n');

  // ── Chat loop ────────────────────────────────────────────────────────
  const history: ChatMessage[] = [];
  const projectBlock = project ? projectSummary(project) : '';
  const skillsText = skillsBlock(skills);
  let compressing = false;
  const usage = new UsageTracker();
  const trackUsage = (u: { inputTokens: number; outputTokens: number }) => usage.add(u);

  /**
   * The system prompt is rebuilt every turn because the memory block
   * changes as the Context Compression Engine folds in old messages.
   */
  const nativeToolsEnabled = Boolean(provider.supportsTools && provider.streamTools);
  const buildSystem = (): ChatMessage => ({
    role: 'system',
    content: buildSystemPrompt(opts.lang, projectBlock, skillsText, memoryBlock(memory), mcp.promptBlock(), nativeToolsEnabled),
  });

  /**
   * Running-summary compression: when enough messages have accumulated
   * beyond the keep-window, fold the oldest into .vexi/memory.json in the
   * background. Recent messages always stay verbatim.
   */
  const maybeCompress = (): void => {
    if (compressing || history.length < KEEP_RECENT + COMPRESS_INTERVAL) return;
    // Slice (not splice) — do NOT mutate history before we know compression succeeded.
    const archiveCount = history.length - KEEP_RECENT;
    const archived = history.slice(0, archiveCount);
    compressing = true;
    compressIntoMemory(provider, memory, archived)
      .then(async (updated) => {
        // Only remove from history after a successful archive write.
        history.splice(0, archiveCount);
        memory = updated;
        await saveMemory(root, updated);
      })
      .catch(() => {}) // history intact on failure — retries next turn
      .finally(() => {
        compressing = false;
      });
  };

  // Native function-calling: used when the provider reliably supports it,
  // otherwise the text-based `vexi-tool` protocol below is used instead.
  const nativeTools = provider.supportsTools && provider.streamTools ? buildNativeTools(mcp) : null;

  /**
   * Run any ```bash``` shell blocks in an AI reply (confirm → snapshot → run
   * → feed output back). Shared by the native and text tool paths, since shell
   * commands are proposed as fenced blocks regardless of tool mode.
   */
  const runShellBlocks = async (reply: string): Promise<void> => {
    for (const cmd of extractShellBlocks(reply)) {
      console.log(accent('▶ run? ') + dim(cmd.slice(0, 120) + (cmd.length > 120 ? '…' : '')));
      const yes = await confirm({ message: 'Execute', default: true }).catch(() => false);
      if (!yes) {
        history.push({ role: 'user', content: `COMMAND SKIPPED: ${cmd}` });
        continue;
      }
      const filesToSnap = SnapshotManager.extractFilePaths(cmd, root);
      if (filesToSnap.length > 0) {
        await snapshots.takeSnapshot(filesToSnap, cmd.slice(0, 80)).catch(() => {});
      }
      const runSpinner = ora({ text: dim('running…'), spinner: 'dots' }).start();
      const { stdout, stderr, code } = await runCommand(cmd, root);
      runSpinner.stop();
      const output = [
        stdout.trim() ? `STDOUT:\n${stdout.trim()}` : '',
        stderr.trim() ? `STDERR:\n${stderr.trim()}` : '',
        `EXIT CODE: ${code}`,
      ].filter(Boolean).join('\n');
      console.log(code === 0 ? ok('✓ done') : err(`✗ exit ${code}`));
      if (stdout.trim()) console.log(dim(stdout.trim().slice(0, 800)));
      if (stderr.trim()) console.log(warn(stderr.trim().slice(0, 400)));
      history.push({ role: 'user', content: `COMMAND RESULT (${cmd.slice(0, 60)}):\n${output.slice(0, 6000)}` });
      recorder.add('user', `COMMAND RESULT:\n${output.slice(0, 6000)}`);
    }
  };

  while (true) {
    let line: string;
    try {
      line = await readMessage(userPrompt);
    } catch {
      // Ctrl+C / closed stdin
      if (usage.hasData) console.log('\n' + dim(`session usage: ${usage.summary(provider.model)}`));
      console.log('\n' + ok(s.goodbye));
      return;
    }

    const text = line.trim();
    if (!text) continue;

    // ── Slash commands ──
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.split(/\s+/);
      switch (cmd) {
        case '/exit':
        case '/quit':
          if (usage.hasData) console.log(dim(`session usage: ${usage.summary(provider.model)}`));
          console.log(ok(s.goodbye));
          await mcp.close();
          return;
        case '/usage':
          console.log(dim(usage.summary(provider.model)) + '\n');
          continue;
        case '/help':
          console.log(dim(s.helpText) + '\n');
          continue;
        case '/clear':
          history.length = 0;
          console.log(ok(s.historyCleared) + '\n');
          continue;
        case '/memory': {
          if (memory.summary || memory.decisions.length > 0) {
            if (memory.summary) console.log(dim(memory.summary));
            for (const decision of memory.decisions) console.log(accent('• ') + decision);
            console.log();
          } else {
            console.log(dim(s.memoryEmpty) + '\n');
          }
          continue;
        }
        case '/model': {
          const model = rest.join(' ').trim();
          if (model) {
            config.model = model;
            await saveConfig(config);
            provider = createProviderFromConfig(config);
            console.log(ok(t(s.modelSwitched, { model })) + '\n');
          } else {
            console.log(dim(`model: ${provider.model}`) + '\n');
          }
          continue;
        }
        case '/undo': {
          const entry = await snapshots.undo().catch(() => null);
          if (!entry) {
            console.log(dim(s.undoNone) + '\n');
          } else {
            console.log(ok(t(s.undoDone, { files: entry.files.join(', ') })) + '\n');
          }
          continue;
        }
        case '/redo': {
          const entry = await snapshots.redo().catch(() => null);
          if (!entry) {
            console.log(dim(s.redoNone) + '\n');
          } else {
            console.log(ok(t(s.redoDone, { files: entry.files.join(', ') })) + '\n');
          }
          continue;
        }
        case '/history': {
          const entries = await snapshots.list().catch(() => []);
          if (entries.length === 0) {
            console.log(dim(s.historyNone) + '\n');
          } else {
            console.log(dim(s.historyHeader));
            for (const e of entries) {
              const time = new Date(e.at).toLocaleTimeString();
              console.log(accent(`  ${time}`) + dim(`  ${e.files.join(', ')}`) + dim(` — ${e.label.slice(0, 60)}`));
            }
            console.log();
          }
          continue;
        }
        case '/push': {
          const firstArg = rest[0] ?? '';
          const pushOnly = firstArg === '--only';
          const message = pushOnly || rest.length === 0 ? undefined : rest.join(' ').trim() || undefined;
          await gitPush({
            cwd: root,
            run: runCommand,
            confirm: (m) => confirm({ message: m, default: true }).catch(() => false),
            provider,
            message,
            pushOnly,
          });
          console.log();
          continue;
        }
        default:
          console.log(warn(`Unknown command: ${cmd}`) + ' ' + dim('(/help)') + '\n');
          continue;
      }
    }

    // ── Send to the AI (with MCP tool-call loop) ──
    history.push({ role: 'user', content: text });
    recorder.add('user', text);

    const spinner = ora({ text: dim(s.thinking), spinner: 'dots' }).start();
    let started = false;

    try {
      // Up to 5 tool-call rounds per user turn (round < 5 below), plus one
      // extra final round where a ```vexi-tool``` reply is no longer honored
      // — so the model is forced to give a plain answer. 6 stream() calls total.
      for (let round = 0; round < 6; round++) {
        const onChunk = (chunk: string) => {
          if (!started) {
            spinner.stop();
            process.stdout.write(vexiLabel + ' ');
            started = true;
          }
          process.stdout.write(chunk);
        };

        // ── Native function-calling path ─────────────────────────────
        if (nativeTools) {
          const { text: reply, toolCalls } =
            await provider.streamTools!([buildSystem(), ...history], nativeTools.defs, onChunk, trackUsage);
          if (!started) spinner.stop();
          process.stdout.write('\n\n');
          history.push({
            role: 'assistant',
            content: reply,
            toolCalls: toolCalls.length ? toolCalls : undefined,
          });
          recorder.add('assistant', reply);

          await runShellBlocks(reply);

          if (toolCalls.length === 0 || round === 5) break;

          for (const tc of toolCalls) {
            const toolSpinner = ora({ text: dim(`${tc.name}…`), spinner: 'dots' }).start();
            const { result } = await dispatchNativeTool(
              tc.name, tc.arguments, nativeTools.route, root, snapshots, mcp,
            );
            toolSpinner.stop();
            console.log(result.startsWith('TOOL ERROR') ? err(`${tc.name}: ${result}`) : ok(`✓ ${tc.name}`));
            history.push({ role: 'tool', content: result.slice(0, 8000), toolCallId: tc.id, toolName: tc.name });
            recorder.add('user', `TOOL RESULT (${tc.name}):\n${result.slice(0, 8000)}`);
          }
          started = false; // next round streams with a fresh label
          continue;
        }

        // ── Text-based `vexi-tool` path (providers without native tools) ─
        const reply = await provider.stream([buildSystem(), ...history], onChunk, trackUsage);
        if (!started) spinner.stop(); // empty reply edge case
        process.stdout.write('\n\n');
        history.push({ role: 'assistant', content: reply });
        recorder.add('assistant', reply);

        await runShellBlocks(reply);

        // Built-in file tool requested by the model? (read/write/edit)
        const builtinCall = round < 5 ? parseBuiltinToolCall(reply) : null;
        if (builtinCall) {
          const fileSpinner = ora({ text: dim(`${builtinCall.tool}…`), spinner: 'dots' }).start();
          const { result } = await executeBuiltinTool(builtinCall, root, snapshots);
          fileSpinner.stop();
          console.log(result.startsWith('TOOL ERROR') ? err(result) : ok(result));
          const toolMessage = `TOOL RESULT (${builtinCall.tool}):\n${result.slice(0, 8000)}`;
          history.push({ role: 'user', content: toolMessage });
          recorder.add('user', toolMessage);
          started = false; // next round streams with a fresh label
          continue;
        }

        // MCP tool call requested by the model?
        const call = mcp.tools.length > 0 && round < 5 ? parseToolCall(reply) : null;
        if (!call) break;

        const toolSpinner = ora({
          text: dim(t(s.mcpRunningTool, { tool: `${call.server}/${call.tool}` })),
          spinner: 'dots',
        }).start();
        let result: string;
        try {
          result = await mcp.callTool(call.server, call.tool, call.arguments);
        } catch (e) {
          result = `TOOL ERROR: ${e instanceof Error ? e.message : String(e)}`;
        }
        toolSpinner.stop();

        const toolMessage = `TOOL RESULT (${call.server}/${call.tool}):\n${result.slice(0, 8000)}`;
        history.push({ role: 'user', content: toolMessage });
        recorder.add('user', toolMessage);
        started = false; // next round streams with a fresh label
      }

      void recorder.save(); // fire-and-forget, atomic
      maybeCompress();
    } catch (e) {
      spinner.stop();
      if (started) process.stdout.write('\n');
      history.pop(); // drop the failed user turn so it can be retried

      if (e instanceof ProviderError && e.isAuthError) {
        console.log(err(s.invalidKey));
        const retry = await confirm({ message: s.reenterKey, default: true }).catch(() => false);
        if (retry) {
          config = await firstRunSetup(s, opts.lang);
          provider = createProviderFromConfig(config);
        }
      } else {
        const message = e instanceof Error ? e.message : String(e);
        console.log(err(t(s.apiError, { message })) + '\n');
      }
    }
  }
}

export interface PrintOptions {
  prompt: string;
  lang: Lang;
  /** Auto-run any shell commands the model proposes instead of skipping them. */
  autoYes: boolean;
}

/**
 * Non-interactive, single-turn mode for scripting/CI (`vexi -p "<prompt>"`).
 * Same system prompt (project scan + memory + skills + MCP tools) and the
 * same tool-call loop as the interactive session, but no readline, no
 * spinners, and no session recording. Requires an existing config — it
 * never runs the interactive BYOK onboarding.
 */
export async function runPrint(opts: PrintOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error(err('No API key configured yet. Run `vexi` once interactively to set one up, then retry with -p.'));
    process.exitCode = 1;
    return;
  }

  const provider = createProviderFromConfig(config);
  const root = process.cwd();

  let project: ProjectMap | null = null;
  try {
    project = await scanProject(root);
  } catch {
    // scanning is best-effort — the prompt still works without it
  }
  const memory = await loadMemory(root);
  const skills = await loadSkills(root);

  const mcp = new McpManager();
  const mcpConfig = await loadMcpConfig();
  if (Object.keys(mcpConfig.mcpServers).length > 0) {
    await mcp.connect().catch(() => {});
  }

  const snapshots = new SnapshotManager(root, Date.now().toString(36));
  await snapshots.registerAsCurrentSession().catch(() => {});

  const projectBlock = project ? projectSummary(project) : '';
  const skillsText = skillsBlock(skills);
  const nativeToolsEnabled = Boolean(provider.supportsTools && provider.streamTools);
  const buildSystem = (): ChatMessage => ({
    role: 'system',
    content: buildSystemPrompt(opts.lang, projectBlock, skillsText, memoryBlock(memory), mcp.promptBlock(), nativeToolsEnabled),
  });

  const history: ChatMessage[] = [{ role: 'user', content: opts.prompt }];

  const usage = new UsageTracker();
  const trackUsage = (u: { inputTokens: number; outputTokens: number }) => usage.add(u);
  const nativeTools = provider.supportsTools && provider.streamTools ? buildNativeTools(mcp) : null;

  const runShellBlocks = async (reply: string): Promise<void> => {
    for (const cmd of extractShellBlocks(reply)) {
      if (!opts.autoYes) {
        console.error(dim(`[skipped — pass --yes to auto-run] $ ${cmd.slice(0, 120)}`));
        history.push({ role: 'user', content: `COMMAND SKIPPED (non-interactive, no --yes flag): ${cmd}` });
        continue;
      }
      console.error(accent('$ ') + cmd.slice(0, 120));
      const filesToSnap = SnapshotManager.extractFilePaths(cmd, root);
      if (filesToSnap.length > 0) {
        await snapshots.takeSnapshot(filesToSnap, cmd.slice(0, 80)).catch(() => {});
      }
      const { stdout, stderr, code } = await runCommand(cmd, root);
      console.error(code === 0 ? ok('✓ done') : err(`✗ exit ${code}`));
      const output = [
        stdout.trim() ? `STDOUT:\n${stdout.trim()}` : '',
        stderr.trim() ? `STDERR:\n${stderr.trim()}` : '',
        `EXIT CODE: ${code}`,
      ].filter(Boolean).join('\n');
      history.push({ role: 'user', content: `COMMAND RESULT (${cmd.slice(0, 60)}):\n${output.slice(0, 6000)}` });
    }
  };

  try {
    for (let round = 0; round < 6; round++) {
      // ── Native function-calling path ─────────────────────────────
      if (nativeTools) {
        const { text: reply, toolCalls } =
          await provider.streamTools!([buildSystem(), ...history], nativeTools.defs, (chunk) => process.stdout.write(chunk), trackUsage);
        process.stdout.write('\n');
        history.push({
          role: 'assistant',
          content: reply,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        });
        await runShellBlocks(reply);
        if (toolCalls.length === 0 || round === 5) break;
        for (const tc of toolCalls) {
          const { result } = await dispatchNativeTool(tc.name, tc.arguments, nativeTools.route, root, snapshots, mcp);
          console.error(result.startsWith('TOOL ERROR') ? err(`${tc.name}: ${result}`) : ok(`✓ ${tc.name}`));
          history.push({ role: 'tool', content: result.slice(0, 8000), toolCallId: tc.id, toolName: tc.name });
        }
        continue;
      }

      // ── Text-based `vexi-tool` path ──────────────────────────────
      const reply = await provider.stream([buildSystem(), ...history], (chunk) => {
        process.stdout.write(chunk);
      }, trackUsage);
      process.stdout.write('\n');
      history.push({ role: 'assistant', content: reply });

      await runShellBlocks(reply);

      const builtinCall = round < 5 ? parseBuiltinToolCall(reply) : null;
      if (builtinCall) {
        const { result } = await executeBuiltinTool(builtinCall, root, snapshots);
        console.error(result.startsWith('TOOL ERROR') ? err(result) : ok(result));
        history.push({ role: 'user', content: `TOOL RESULT (${builtinCall.tool}):\n${result.slice(0, 8000)}` });
        continue;
      }

      const call = mcp.tools.length > 0 && round < 5 ? parseToolCall(reply) : null;
      if (!call) break;

      let result: string;
      try {
        result = await mcp.callTool(call.server, call.tool, call.arguments);
      } catch (e) {
        result = `TOOL ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }
      history.push({ role: 'user', content: `TOOL RESULT (${call.server}/${call.tool}):\n${result.slice(0, 8000)}` });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(err(message));
    process.exitCode = 1;
  } finally {
    if (usage.hasData) console.error(dim(`usage: ${usage.summary(provider.model)}`));
    await mcp.close();
  }
}

/** Ask for the API key, auto-detect the provider, save the config. */
async function firstRunSetup(s: Strings, lang: Lang): Promise<VexiConfig> {
  console.log(accent(s.welcome));
  console.log(dim(s.firstRunIntro) + '\n');

  // 1. Get a non-empty, sanitized key
  let key = '';
  while (!key) {
    const raw = await input({ message: s.enterApiKey }).catch(() => {
      console.log('\n' + ok(s.goodbye));
      process.exit(0);
    });
    key = sanitizeKey(raw ?? '');
    if (!key) console.log(warn(s.emptyKey));
  }

  // 2. Auto-detect the provider, fall back to manual selection
  let providerId: ProviderId | null = detectProvider(key);
  if (providerId) {
    console.log(ok(t(s.detectedProvider, { provider: PROVIDER_INFO[providerId].label })));
  } else {
    console.log(warn(s.detectFailed));
    providerId = await select<ProviderId>({
      message: s.selectProvider,
      choices: (Object.keys(PROVIDER_INFO) as ProviderId[]).map((id) => ({
        name: PROVIDER_INFO[id].label,
        value: id,
      })),
    });
  }

  // 3. Save locally (atomic write, mode 600)
  const config: VexiConfig = { provider: providerId, apiKey: key, lang };
  await saveConfig(config);
  console.log(ok(t(s.configSaved, { path: CONFIG_PATH })) + '\n');
  return config;
}

/** System prompt for the chat session. */
function buildSystemPrompt(
  lang: Lang,
  projectBlock: string,
  skillsText: string,
  memoryText: string,
  mcpText: string,
  nativeTools = false,
): string {
  const langNames: Record<Lang, string> = {
    en: 'English',
    ar: 'Arabic',
    es: 'Spanish',
    pt: 'Portuguese',
    fr: 'French',
  };
  const parts = [
    'You are Vexi, an open-source AI coding agent running in the user\'s terminal.',
    'Be concise, technical and direct. Prefer code over prose.',
    'Format code in fenced Markdown blocks with the language tag.',
    `Environment: OS=${platform()}, cwd=${process.cwd()}.`,
    `The user's preferred language is ${langNames[lang]}; reply in that language unless asked otherwise (code and identifiers stay in English).`,
    '',
    '## Command execution',
    'You can run shell commands directly. Wrap any command in a fenced code block tagged `bash` or `sh` — regardless of the project language.',
    'Vexi will show the command to the user, ask for confirmation, execute it, and report the output back to you.',
    'Use this to: install dependencies, build projects, run tests, start servers, scaffold files, etc.',
    'Examples by language:',
    '  JavaScript/Node: ```bash\nnpm install\nnpm run build\n```',
    '  Python:          ```bash\npip install -r requirements.txt\npython main.py\n```',
    '  Java (Maven):    ```bash\nmvn compile\nmvn package\njava -jar target/app.jar\n```',
    '  Java (Gradle):   ```bash\ngradle build\njava -jar build/libs/app.jar\n```',
    '  C/C++:           ```bash\ngcc main.c -o main\n./main\n```',
    '  Rust:            ```bash\ncargo build\ncargo run\n```',
    '  Go:              ```bash\ngo build ./...\ngo run main.go\n```',
    'Always use `bash` as the code block language tag for commands — never `python`, `java`, etc.',
    'After seeing the output, continue helping based on the result.',
  ];
  if (nativeTools) {
    // Native function-calling: file tools (and MCP tools) are advertised
    // through the API's tools parameter, so only a short pointer is needed.
    parts.push(
      '',
      '## File tools',
      'You have native tools to read and edit files (read_file, write_file, edit_file). '
        + 'Use them to inspect and change files instead of shell cat/sed. Read a file before editing it.',
    );
  } else {
    parts.push('', builtinToolsBlock());
  }
  if (projectBlock) parts.push('', '## Project map', projectBlock);
  if (memoryText) parts.push('', memoryText);
  if (skillsText) parts.push('', skillsText);
  // In native mode, MCP tools are sent via the API — skip the text protocol block.
  if (mcpText && !nativeTools) parts.push('', mcpText);
  return parts.join('\n');
}
