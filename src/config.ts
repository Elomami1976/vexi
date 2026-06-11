/**
 * Local configuration: ~/.vexi/config.json
 *
 * Stores the API key, provider, model and language preference.
 * - Written atomically (temp file + rename) to avoid corruption.
 * - File mode 0o600 so the key is only readable by the current OS user
 *   (chmod is a no-op on Windows, where the user profile dir is already
 *   protected by NTFS ACLs).
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ProviderId } from './providers/types.js';

export interface VexiConfig {
  provider: ProviderId;
  apiKey: string;
  model?: string;
  lang?: string;
}

export const VEXI_DIR = join(homedir(), '.vexi');
export const CONFIG_PATH = join(VEXI_DIR, 'config.json');

/** Load the config, or `null` if it doesn't exist / is unreadable. */
export async function loadConfig(): Promise<VexiConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as VexiConfig;
    if (!config.apiKey || !config.provider) return null;
    return config;
  } catch {
    return null;
  }
}

/** Save the config atomically with owner-only permissions. */
export async function saveConfig(config: VexiConfig): Promise<void> {
  await fs.mkdir(VEXI_DIR, { recursive: true, mode: 0o700 });

  // Atomic write: write to a temp file in the same dir, then rename.
  const tmpPath = join(VEXI_DIR, `.config-${randomBytes(6).toString('hex')}.tmp`);
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  try {
    await fs.rename(tmpPath, CONFIG_PATH);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }

  // Re-assert permissions in case the file already existed (no-op on Windows).
  await fs.chmod(CONFIG_PATH, 0o600).catch(() => {});
}

/** Delete the stored config (used by `vexi config reset`). */
export async function resetConfig(): Promise<boolean> {
  try {
    await fs.unlink(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}
