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
import { readJson, writeJsonAtomic } from './utils/fs-atomic.js';
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
  const config = await readJson<VexiConfig>(CONFIG_PATH);
  if (!config?.apiKey || !config.provider) return null;
  return config;
}

/** Save the config atomically with owner-only permissions. */
export async function saveConfig(config: VexiConfig): Promise<void> {
  await writeJsonAtomic(CONFIG_PATH, config, { mode: 0o600, dirMode: 0o700 });
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
