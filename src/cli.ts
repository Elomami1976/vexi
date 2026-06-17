/**
 * CLI definition (commander).
 *
 *   vexi                       start a chat session (first run: BYOK setup)
 *   vexi --lang ar             override the UI/output language
 *   vexi config                show config location + provider
 *   vexi config reset          delete the stored API key & settings
 *   vexi skill list            show active skills
 *   vexi skill add <src>       add a skill (local .md file or GitHub URL)
 *   vexi skill remove <name>   remove a skill
 *   vexi replay                list recorded sessions
 *   vexi replay --export       export latest session as standalone HTML
 *   vexi explain <path> --ar   explain a file/folder in your language
 *   vexi graph [--visual]      interactive dependency graph (d3 HTML)
 *   vexi mcp list/add/remove   manage external MCP servers (~/.vexi/mcp.json)
 *   vexi --mcp-server          expose Vexi as an MCP server (stdio)
 *   vexi learn [--apply]       learn your coding style from past sessions
 */

import { Command } from 'commander';
import ora from 'ora';
import { runAgent } from './agent.js';
import { loadConfig, resetConfig, CONFIG_PATH } from './config.js';
import { loadSkills, addSkill, removeSkill } from './skills/index.js';
import { listSessions } from './replay/recorder.js';
import { exportReplay } from './replay/export.js';
import { explain } from './explain/index.js';
import { buildGraph } from './graph/index.js';
import { exportGraphHtml } from './graph/html.js';
import { loadMcpConfig, saveMcpConfig, MCP_CONFIG_PATH } from './mcp/config.js';
import { learn, applyLearned, DEFAULT_MAX_SESSIONS } from './learn/index.js';
import { createProvider, PROVIDER_INFO } from './providers/index.js';
import { openInDefaultApp } from './utils/open.js';
import { SnapshotManager } from './snapshots/index.js';
import { detectSystemLang, getStrings, normalizeLang, t, SUPPORTED_LANGS, type Lang } from './i18n/index.js';
import { accent, dim, err, ok } from './ui/index.js';

export const VERSION = '0.5.5';

/** Resolve the active language: --lang flag > saved config > system locale. */
async function resolveLang(flag?: string): Promise<Lang> {
  if (flag) {
    const lang = normalizeLang(flag);
    if (!lang) {
      console.error(err(`Unsupported language "${flag}". Supported: ${SUPPORTED_LANGS.join(', ')}`));
      process.exit(1);
    }
    return lang;
  }
  const config = await loadConfig();
  return normalizeLang(config?.lang) ?? detectSystemLang();
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name('vexi')
    .description('Open-source AI coding agent for your terminal. BYOK, zero config, multilingual.')
    .version(VERSION, '-v, --version')
    .option('-l, --lang <lang>', `UI language (${SUPPORTED_LANGS.join('/')})`)
    .option('--mcp-server', 'run Vexi as an MCP server over stdio (for Claude Desktop, Cursor, etc.)')
    .action(async (options: { lang?: string; mcpServer?: boolean }) => {
      if (options.mcpServer) {
        // stdout becomes the JSON-RPC channel — no banner, no prompts.
        const { runMcpServer } = await import('./mcp/server.js');
        await runMcpServer();
        return;
      }
      const lang = await resolveLang(options.lang);
      await runAgent({ lang, version: VERSION });
    });

  const config = program.command('config').description('Manage Vexi configuration');

  config
    .command('show', { isDefault: true })
    .description('Show config location and current provider')
    .action(async () => {
      const cfg = await loadConfig();
      console.log(dim('config: ') + accent(CONFIG_PATH));
      if (cfg) {
        console.log(dim('provider: ') + accent(PROVIDER_INFO[cfg.provider].label));
        console.log(dim('model: ') + accent(cfg.model ?? PROVIDER_INFO[cfg.provider].defaultModel));
        console.log(dim('lang: ') + accent(cfg.lang ?? 'auto'));
      } else {
        console.log(dim('No configuration yet — run `vexi` to set up.'));
      }
    });

  config
    .command('reset')
    .description('Delete the stored API key and settings')
    .action(async () => {
      const lang = await resolveLang();
      const s = getStrings(lang);
      const deleted = await resetConfig();
      console.log(deleted ? ok(s.configReset) : dim(s.configResetNone));
    });

  // ── Custom Skills (Feature 2.5) ──────────────────────────────────────
  const skill = program.command('skill').description('Manage project skills (.vexi/skills/*.md)');

  skill
    .command('list', { isDefault: true })
    .description('Show active skills')
    .action(async () => {
      const s = getStrings(await resolveLang());
      const skills = await loadSkills(process.cwd());
      if (skills.length === 0) {
        console.log(dim(s.skillListEmpty));
        return;
      }
      for (const sk of skills) {
        const firstLine = sk.content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80);
        console.log(accent(sk.name) + dim(` — ${firstLine}`));
      }
    });

  skill
    .command('add <source>')
    .description('Add a skill from a local .md file or a GitHub URL')
    .action(async (source: string) => {
      const s = getStrings(await resolveLang());
      try {
        const name = await addSkill(process.cwd(), source);
        console.log(ok(t(s.skillAdded, { name })));
      } catch (e) {
        console.error(err(e instanceof Error ? e.message : String(e)));
        process.exitCode = 1;
      }
    });

  skill
    .command('remove <name>')
    .description('Remove a skill by name')
    .action(async (name: string) => {
      const s = getStrings(await resolveLang());
      const removed = await removeSkill(process.cwd(), name);
      console.log(removed ? ok(t(s.skillRemoved, { name })) : err(t(s.skillNotFound, { name })));
      if (!removed) process.exitCode = 1;
    });

  // ── Vexi Replay (Feature 3) ─────────────────────────────────────────
  program
    .command('replay')
    .description('List recorded sessions, or export one as a standalone HTML replay')
    .option('-e, --export', 'export a session as HTML')
    .option('-s, --session <name>', 'session file name (default: most recent)')
    .option('-o, --out <file>', 'output HTML path')
    .option('-l, --lang <lang>', `replay language (${SUPPORTED_LANGS.join('/')})`)
    .action(async (options: { export?: boolean; session?: string; out?: string; lang?: string }) => {
      const lang = await resolveLang(options.lang);
      const s = getStrings(lang);

      if (!options.export) {
        const sessions = await listSessions(process.cwd());
        if (sessions.length === 0) {
          console.log(dim(s.replayNone));
          return;
        }
        for (const file of sessions) console.log(accent(file));
        console.log(dim('\nvexi replay --export [--session <name>] [--lang ar]'));
        return;
      }

      try {
        const path = await exportReplay(process.cwd(), {
          lang,
          session: options.session,
          out: options.out,
        });
        console.log(ok(t(s.replayExported, { path })));
        openInDefaultApp(path);
      } catch (e) {
        console.error(err(e instanceof Error ? e.message : String(e)));
        process.exitCode = 1;
      }
    });

  // ── Multilingual explain (Feature 4) ─────────────────────────────────
  program
    .command('explain <path>')
    .description('Explain a file or folder in your language (Arabic opens as RTL HTML)')
    .option('-l, --lang <lang>', `output language (${SUPPORTED_LANGS.join('/')})`)
    .option('--ar', 'Arabic').option('--en', 'English').option('--es', 'Spanish')
    .option('--pt', 'Portuguese').option('--fr', 'French')
    .action(async (target: string, options: Record<string, string | boolean>) => {
      // Shorthand flags (--ar) win over --lang, which wins over config/system.
      const short = SUPPORTED_LANGS.find((l) => options[l] === true);
      const lang = short ?? (await resolveLang(options.lang as string | undefined));
      const s = getStrings(lang);

      const cfg = await loadConfig();
      if (!cfg) {
        console.error(err('No API key configured — run `vexi` once to set up.'));
        process.exitCode = 1;
        return;
      }
      const provider = createProvider(cfg.provider, cfg.apiKey, cfg.model);

      const spinner = ora({ text: dim(s.explaining), spinner: 'dots' }).start();
      let started = false;
      try {
        const result = await explain(provider, target, lang, (chunk) => {
          if (!started) {
            spinner.stop();
            started = true;
          }
          process.stdout.write(chunk);
        });
        spinner.stop();
        if (result) {
          // Arabic → written to RTL HTML + markdown, opened in the browser
          console.log(ok(t(s.explainSavedFile, { path: result.htmlPath })));
          console.log(dim(result.mdPath));
          openInDefaultApp(result.htmlPath);
        } else {
          process.stdout.write('\n');
        }
      } catch (e) {
        spinner.stop();
        console.error(err(e instanceof Error ? e.message : String(e)));
        process.exitCode = 1;
      }
    });

  // ── Visual code graph (Feature 5) ─────────────────────────────────────
  program
    .command('graph')
    .description('Generate an interactive dependency graph (single HTML, opens in browser)')
    .option('--visual', 'open the graph in the browser (default behavior)')
    .option('-o, --out <file>', 'output HTML path')
    .option('-l, --lang <lang>', `page language (${SUPPORTED_LANGS.join('/')})`)
    .action(async (options: { visual?: boolean; out?: string; lang?: string }) => {
      const lang = await resolveLang(options.lang);
      const s = getStrings(lang);
      const spinner = ora({ text: dim(s.graphBuilding), spinner: 'dots' }).start();
      try {
        const graph = await buildGraph(process.cwd());
        const path = await exportGraphHtml(process.cwd(), graph, lang, options.out);
        spinner.stop();
        console.log(ok(t(s.graphExported, { path })));
        console.log(dim(`${graph.nodes.length} modules · ${graph.edges.length} imports`));
        openInDefaultApp(path);
      } catch (e) {
        spinner.stop();
        console.error(err(e instanceof Error ? e.message : String(e)));
        process.exitCode = 1;
      }
    });

  // ── MCP client config (Feature 6a) ───────────────────────────────────
  const mcp = program.command('mcp').description('Manage external MCP servers (~/.vexi/mcp.json)');

  mcp
    .command('list', { isDefault: true })
    .description('Show configured MCP servers')
    .action(async () => {
      const s = getStrings(await resolveLang());
      const config = await loadMcpConfig();
      const entries = Object.entries(config.mcpServers);
      console.log(dim('config: ') + accent(MCP_CONFIG_PATH));
      if (entries.length === 0) {
        console.log(dim(s.mcpListEmpty));
        return;
      }
      for (const [name, server] of entries) {
        console.log(accent(name) + dim(` — ${server.command} ${(server.args ?? []).join(' ')}`));
      }
    });

  mcp
    .command('add <name> <command> [args...]')
    .description('Add an MCP server (e.g. vexi mcp add github npx -y @modelcontextprotocol/server-github)')
    .action(async (name: string, command: string, args: string[]) => {
      const s = getStrings(await resolveLang());
      const config = await loadMcpConfig();
      config.mcpServers[name] = { command, ...(args.length ? { args } : {}) };
      await saveMcpConfig(config);
      console.log(ok(t(s.mcpAdded, { name })));
    });

  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      const s = getStrings(await resolveLang());
      const config = await loadMcpConfig();
      if (!config.mcpServers[name]) {
        console.error(err(t(s.mcpNotFound, { name })));
        process.exitCode = 1;
        return;
      }
      delete config.mcpServers[name];
      await saveMcpConfig(config);
      console.log(ok(t(s.mcpRemoved, { name })));
    });

  // ── Vexi Learn (Feature 7) ──────────────────────────────────────
  program
    .command('learn')
    .description('Learn your personal coding style from past sessions and turn it into a skill')
    .option('-a, --apply', 'save the result as .vexi/skills/learned-style.md')
    .option('-n, --sessions <count>', 'number of recent sessions to analyze', String(DEFAULT_MAX_SESSIONS))
    .option('-l, --lang <lang>', `UI language (${SUPPORTED_LANGS.join('/')})`)
    .action(async (options: { apply?: boolean; sessions?: string; lang?: string }) => {
      const lang = await resolveLang(options.lang);
      const s = getStrings(lang);

      const cfg = await loadConfig();
      if (!cfg) {
        console.error(err('No API key configured — run `vexi` once to set up.'));
        process.exitCode = 1;
        return;
      }
      const provider = createProvider(cfg.provider, cfg.apiKey, cfg.model);
      const maxSessions = Math.max(1, parseInt(options.sessions ?? '', 10) || DEFAULT_MAX_SESSIONS);

      const spinner = ora({ text: dim(s.learnAnalyzing), spinner: 'dots' }).start();
      try {
        const result = await learn(provider, process.cwd(), maxSessions);
        spinner.stop();

        if (result.evidence.sessionsAnalyzed === 0) {
          console.log(dim(s.learnNoSessions));
          return;
        }
        if (!result.markdown) {
          console.log(dim(s.learnNothing));
          return;
        }

        console.log(ok(t(s.learnPreview, {
          sessions: String(result.evidence.sessionsAnalyzed),
          signals: String(result.evidence.signals.length),
        })));
        console.log('\n' + result.markdown + '\n');

        if (options.apply) {
          const path = await applyLearned(process.cwd(), result.markdown);
          console.log(ok(t(s.learnApplied, { path })));
        } else {
          console.log(dim(s.learnApplyHint));
        }
      } catch (e) {
        spinner.stop();
        console.error(err(e instanceof Error ? e.message : String(e)));
        process.exitCode = 1;
      }
    });

  // ── Undo / Redo / History / Clean (Feature 8) ────────────────────────
  program
    .command('undo')
    .description('Revert the last AI file edit in the current session')
    .action(async () => {
      const s = getStrings(await resolveLang());
      const mgr = await SnapshotManager.forCurrentSession(process.cwd());
      if (!mgr) {
        console.log(dim(s.snapshotNoSession));
        return;
      }
      const entry = await mgr.undo().catch(() => null);
      if (!entry) {
        console.log(dim(s.undoNone));
      } else {
        console.log(ok(t(s.undoDone, { files: entry.files.join(', ') })));
      }
    });

  program
    .command('redo')
    .description('Re-apply the last undone AI file edit')
    .action(async () => {
      const s = getStrings(await resolveLang());
      const mgr = await SnapshotManager.forCurrentSession(process.cwd());
      if (!mgr) {
        console.log(dim(s.snapshotNoSession));
        return;
      }
      const entry = await mgr.redo().catch(() => null);
      if (!entry) {
        console.log(dim(s.redoNone));
      } else {
        console.log(ok(t(s.redoDone, { files: entry.files.join(', ') })));
      }
    });

  program
    .command('history')
    .description('List recent AI file edits in this session (with timestamps)')
    .action(async () => {
      const s = getStrings(await resolveLang());
      const mgr = await SnapshotManager.forCurrentSession(process.cwd());
      if (!mgr) {
        console.log(dim(s.snapshotNoSession));
        return;
      }
      const entries = await mgr.list().catch(() => []);
      if (entries.length === 0) {
        console.log(dim(s.historyNone));
        return;
      }
      console.log(dim(s.historyHeader));
      for (const e of entries) {
        const time = new Date(e.at).toLocaleTimeString();
        console.log(accent(`  ${time}`) + dim(`  ${e.files.join(', ')}`) + dim(` — ${e.label.slice(0, 60)}`));
      }
    });

  program
    .command('clean')
    .description('Clear old snapshot sessions to free disk space (.vexi/snapshots/)')
    .action(async () => {
      const s = getStrings(await resolveLang());
      const mgr = await SnapshotManager.forCurrentSession(process.cwd());
      const count = await SnapshotManager.cleanAll(process.cwd(), mgr?.sessionId);
      console.log(ok(t(s.cleanDone, { count: String(count) })));
    });

  return program;
}
