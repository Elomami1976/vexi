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
import { platform, EOL } from 'node:os';
import { exec as cpExec } from 'node:child_process';
import { input, select, confirm } from '@inquirer/prompts';
import * as nodeRl from 'node:readline';
import ora from 'ora';

import { loadConfig, saveConfig, CONFIG_PATH, type VexiConfig } from './config.js';
import {
  createProvider,
  detectProvider,
  sanitizeKey,
  PROVIDER_INFO,
  ProviderError,
  type ChatMessage,
  type Provider,
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
import { ARABIC_RTL_NOTE, getStrings, t, type Lang, type Strings } from './i18n/index.js';
import { accent, dim, err, ok, printBanner, printStatusLine, userPrompt, vexiLabel, warn } from './ui/index.js';

interface AgentOptions {
  lang: Lang;
  version: string;
}

/** Extract shell commands from fenced code blocks in an AI reply. */
function extractShellBlocks(reply: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:bash|sh|shell|cmd|powershell|ps1)\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply)) !== null) {
    const code = m[1].trim();
    if (code) blocks.push(code);
  }
  return blocks;
}

/** Run a shell command and return { stdout, stderr, code }. */
function runCommand(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    cpExec(cmd, { cwd, shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh', maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: err?.code ?? 0 });
    });
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

  let provider = createProvider(config.provider, config.apiKey, config.model);
  const root = process.cwd();

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

  // ── Session recording (Vexi Replay) — saved after every turn ─────────
  const recorder = new SessionRecorder(root, {
    project: basename(root),
    provider: PROVIDER_INFO[config.provider].label,
    model: provider.model,
    lang: opts.lang,
  });

  printStatusLine({
    project: project?.stack.length
      ? `${basename(root)} (${project.stack.slice(0, 4).join(', ')})`
      : basename(root),
    provider: PROVIDER_INFO[config.provider].label,
    model: provider.model,
    lang: opts.lang,
  });

  if (memory.summary || memory.decisions.length > 0) {
    console.log(dim(t(s.memoryLoaded, { decisions: String(memory.decisions.length) })));
  }
  if (skills.length > 0) {
    console.log(dim(t(s.skillsLoaded, { names: skills.map((sk) => sk.name).join(', ') })));
  }
  console.log(dim(s.chatHint) + '\n');

  // ── Chat loop ────────────────────────────────────────────────────────
  const history: ChatMessage[] = [];
  const projectBlock = project ? projectSummary(project) : '';
  const skillsText = skillsBlock(skills);
  let compressing = false;

  /**
   * The system prompt is rebuilt every turn because the memory block
   * changes as the Context Compression Engine folds in old messages.
   */
  const buildSystem = (): ChatMessage => ({
    role: 'system',
    content: buildSystemPrompt(opts.lang, projectBlock, skillsText, memoryBlock(memory), mcp.promptBlock()),
  });

  /**
   * Running-summary compression: when enough messages have accumulated
   * beyond the keep-window, fold the oldest into .vexi/memory.json in the
   * background. Recent messages always stay verbatim.
   */
  const maybeCompress = (): void => {
    if (compressing || history.length < KEEP_RECENT + COMPRESS_INTERVAL) return;
    const archived = history.splice(0, history.length - KEEP_RECENT);
    compressing = true;
    compressIntoMemory(provider, memory, archived)
      .then(async (updated) => {
        memory = updated;
        await saveMemory(root, updated);
      })
      .catch(() => {}) // compression must never break the chat
      .finally(() => {
        compressing = false;
      });
  };

  while (true) {
    let line: string;
    try {
      line = await readMessage(userPrompt);
    } catch {
      // Ctrl+C / closed stdin
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
          console.log(ok(s.goodbye));
          await mcp.close();
          return;
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
            provider = createProvider(config.provider, config.apiKey, model);
            console.log(ok(t(s.modelSwitched, { model })) + '\n');
          } else {
            console.log(dim(`model: ${provider.model}`) + '\n');
          }
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
      // Up to 5 tool-call rounds per user turn, then a final plain answer.
      for (let round = 0; round < 6; round++) {
        const reply = await provider.stream([buildSystem(), ...history], (chunk) => {
          if (!started) {
            spinner.stop();
            process.stdout.write(vexiLabel + ' ');
            started = true;
          }
          process.stdout.write(chunk);
        });
        if (!started) spinner.stop(); // empty reply edge case
        process.stdout.write('\n\n');
        history.push({ role: 'assistant', content: reply });
        recorder.add('assistant', reply);

        // ── Auto-run shell commands suggested by the AI ──────────────
        const shellBlocks = extractShellBlocks(reply);
        for (const cmd of shellBlocks) {
          console.log(accent('▶ run? ') + dim(cmd.slice(0, 120) + (cmd.length > 120 ? '…' : '')));
          const yes = await confirm({ message: 'Execute', default: true }).catch(() => false);
          if (!yes) {
            history.push({ role: 'user', content: `COMMAND SKIPPED: ${cmd}` });
            continue;
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
          provider = createProvider(config.provider, config.apiKey, config.model);
        }
      } else {
        const message = e instanceof Error ? e.message : String(e);
        console.log(err(t(s.apiError, { message })) + '\n');
      }
    }
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
    'You can run shell commands directly. Wrap any command you want to execute in a fenced code block tagged `bash` or `sh`.',
    'Vexi will show the command to the user, ask for confirmation, execute it, and report the output back to you.',
    'Use this to: install dependencies, build projects, run tests, start servers, scaffold files, etc.',
    'Example: to install deps write:  ```bash\nnpm install\n```',
    'After seeing the output, continue helping based on the result.',
  ];
  if (projectBlock) parts.push('', '## Project map', projectBlock);
  if (memoryText) parts.push('', memoryText);
  if (skillsText) parts.push('', skillsText);
  if (mcpText) parts.push('', mcpText);
  return parts.join('\n');
}
