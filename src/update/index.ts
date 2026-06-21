/**
 * Update management: check, install, and uninstall.
 *
 * checkForUpdate - non-blocking; returns cached result fast, fires network
 *   check in the background and caches it for the next run.
 * runUpdate      - npm install -g vexi-cli@latest with streamed output.
 * runUninstall   - npm uninstall -g vexi-cli with optional ~/.vexi purge.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { confirm } from '@inquirer/prompts';
import { VEXI_DIR } from '../config.js';
import { VERSION } from '../version.js';
import { dim, err, ok, warn, accent } from '../ui/index.js';

const UPDATE_CACHE_PATH = join(VEXI_DIR, 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 1500;
const NPM_REGISTRY = 'https://registry.npmjs.org/vexi-cli/latest';

interface UpdateCache {
  lastCheck: string;
  latest: string;
}

/** Returns true if version string `a` is strictly greater than `b`. */
function semverGt(a: string, b: string): boolean {
  const parts = (v: string): number[] =>
    v.replace(/[^0-9.]/g, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj = 0, aMin = 0, aPat = 0] = parts(a);
  const [bMaj = 0, bMin = 0, bPat = 0] = parts(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

/**
 * Check whether a newer version of vexi-cli is published on npm.
 *
 * - Returns the newer version string, or null (no update / check failed).
 * - Reads a local cache first; only hits the network when the cache is
 *   older than 24 hours.
 * - When the cache is stale, fires a background fetch (max 1500 ms) and
 *   updates the cache when done. Returns null for this run so startup is
 *   never blocked by the network.
 * - All errors are swallowed silently.
 */
export async function checkForUpdate(): Promise<string | null> {
  try {
    const cacheRaw = await fs.readFile(UPDATE_CACHE_PATH, 'utf8').catch(() => null);
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw) as UpdateCache;
      const age = Date.now() - new Date(cache.lastCheck).getTime();
      if (age < CHECK_INTERVAL_MS) {
        // Cache is fresh: return immediately
        return semverGt(cache.latest, VERSION) ? cache.latest : null;
      }
    }

    // Cache is stale or missing: fire a background fetch and return null now
    void (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(NPM_REGISTRY, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return;
        const json = (await res.json()) as { version?: string };
        const latest = json.version;
        if (!latest) return;
        await fs.mkdir(VEXI_DIR, { recursive: true }).catch(() => {});
        await fs.writeFile(
          UPDATE_CACHE_PATH,
          JSON.stringify({ lastCheck: new Date().toISOString(), latest }),
          'utf8',
        ).catch(() => {});
      } catch {
        // network error or timeout -- silently ignored
      }
    })();

    return null;
  } catch {
    return null;
  }
}

/** Spawn npm with inherited stdio and return whether it exited successfully. */
async function runNpm(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(cmd, args, { stdio: 'inherit' });

    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') {
        console.error(
          err('\nnpm not found. Install Node.js (which includes npm) from https://nodejs.org'),
        );
      } else {
        console.error(err(`\nFailed to run npm: ${e.message}`));
      }
      resolve(false);
    });

    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Run `npm install -g vexi-cli@latest`, streaming npm output to the terminal.
 * Prints the manual command and exits non-zero on any failure.
 */
export async function runUpdate(): Promise<void> {
  console.log(dim('Running: npm install -g vexi-cli@latest\n'));

  const ok_ = await runNpm(['install', '-g', 'vexi-cli@latest']);

  if (ok_) {
    console.log('\n' + ok('Vexi updated successfully.'));
    console.log(dim('Restart your terminal or run `vexi --version` to confirm.'));
  } else {
    console.log('\n' + warn('If the error above is a permissions problem, try one of:'));
    console.log(dim('  sudo npm install -g vexi-cli@latest'));
    console.log(dim('  # Windows: run your terminal as Administrator'));
    console.log(dim('  # or use a Node version manager (nvm, fnm, volta)'));
    console.log(dim('\nManual command:  npm install -g vexi-cli@latest'));
    process.exitCode = 1;
  }
}

/**
 * Uninstall vexi-cli.
 *
 * 1. Describes what will happen and asks for confirmation.
 * 2. Runs `npm uninstall -g vexi-cli`, streaming output.
 * 3. If --purge: asks for a SECOND confirmation, then deletes ~/.vexi.
 *
 * Always prints the manual command, because on some platforms (Windows,
 * certain npm prefixes) a running binary cannot delete itself in-process.
 */
export async function runUninstall(purge: boolean): Promise<void> {
  // Step 1: Describe what will happen
  console.log();
  console.log(accent('What will happen:'));
  console.log(dim('  - Remove:  vexi-cli global npm package'));
  if (purge) {
    console.log(warn(`  - Delete:  ${VEXI_DIR}`));
    console.log(warn('             (config, API keys, memory, snapshots -- permanent!)'));
  } else {
    console.log(dim(`  - Keep:    ${VEXI_DIR} (your config, keys, and memory are preserved)`));
    console.log(dim('             Use --purge to also delete this directory.'));
  }
  console.log();

  // Step 2: First confirmation
  const proceed = await confirm({ message: 'Remove vexi-cli?', default: false }).catch(() => false);
  if (!proceed) {
    console.log(dim('\nCancelled. Nothing was changed.'));
    return;
  }

  console.log(dim('\nRunning: npm uninstall -g vexi-cli\n'));

  const uninstallOk = await runNpm(['uninstall', '-g', 'vexi-cli']);

  if (!uninstallOk) {
    console.log('\n' + warn('Uninstall may have failed. Run this manually if needed:'));
    console.log(dim('  npm uninstall -g vexi-cli'));
    if (purge) {
      console.log(dim('  rm -rf ~/.vexi                               # macOS / Linux'));
      console.log(dim('  rmdir /s /q %USERPROFILE%\\.vexi             # Windows'));
    }
    process.exitCode = 1;
    return;
  }

  console.log('\n' + ok('vexi-cli uninstalled.'));
  console.log(dim('Manual command for reference:  npm uninstall -g vexi-cli'));
  console.log(dim('To reinstall:                  npm install -g vexi-cli'));

  // Step 3: Purge ~/.vexi if requested
  if (purge) {
    console.log();
    console.log(warn(`About to permanently delete ${VEXI_DIR}`));
    console.log(warn('This removes config, API keys, memory, and sessions. This cannot be undone.'));
    console.log();

    const confirmPurge = await confirm({
      message: `Delete ${VEXI_DIR} permanently?`,
      default: false,
    }).catch(() => false);

    if (!confirmPurge) {
      console.log(dim(`\n${VEXI_DIR} was not deleted.`));
      console.log(dim(`To remove it manually:`));
      console.log(dim(`  rm -rf ~/.vexi                               # macOS / Linux`));
      console.log(dim(`  rmdir /s /q %USERPROFILE%\\.vexi             # Windows`));
      return;
    }

    try {
      await fs.rm(VEXI_DIR, { recursive: true, force: true });
      console.log(ok(`Deleted ${VEXI_DIR}`));
    } catch (e) {
      console.error(err(`Could not delete ${VEXI_DIR}: ${e instanceof Error ? e.message : String(e)}`));
      console.log(dim('Remove it manually:'));
      console.log(dim(`  rm -rf ~/.vexi                               # macOS / Linux`));
      console.log(dim(`  rmdir /s /q %USERPROFILE%\\.vexi             # Windows`));
      process.exitCode = 1;
    }
  }
}
