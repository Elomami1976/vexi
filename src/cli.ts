/**
 * CLI definition (commander).
 *
 *   vexi                 start a chat session (first run: BYOK setup)
 *   vexi --lang ar       override the UI/output language
 *   vexi config          show config location + provider
 *   vexi config reset    delete the stored API key & settings
 */

import { Command } from 'commander';
import { runAgent } from './agent.js';
import { loadConfig, resetConfig, CONFIG_PATH } from './config.js';
import { detectSystemLang, getStrings, normalizeLang, SUPPORTED_LANGS, type Lang } from './i18n/index.js';
import { PROVIDER_INFO } from './providers/index.js';
import { accent, dim, err, ok } from './ui/index.js';

export const VERSION = '0.1.0';

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
    .action(async (options: { lang?: string }) => {
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

  return program;
}
