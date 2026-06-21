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
import { z } from 'zod';
import { readJson, writeJsonAtomic } from './utils/fs-atomic.js';

export interface VexiConfig {
  /** Provider identifier: a ProviderId for old key-based configs, or any string for URL-based configs. */
  provider: string;
  /** Human-readable label set by vexi setup (e.g. "Z.ai (Coding Plan)"). */
  displayName?: string;
  apiKey: string;
  /** API endpoint root set by vexi setup (e.g. "https://openrouter.ai/api/v1"). */
  baseUrl?: string;
  model?: string;
  lang?: string;
}

const VexiConfigSchema = z.object({
  provider:    z.string().min(1),
  displayName: z.string().optional(),
  apiKey:      z.string().min(1),
  baseUrl:     z.string().optional(),
  model:       z.string().optional(),
  lang:        z.string().optional(),
});

export const VEXI_DIR = join(homedir(), '.vexi');
export const CONFIG_PATH = join(VEXI_DIR, 'config.json');

/** Load the config, or `null` if it doesn't exist / is unreadable / fails validation. */
export async function loadConfig(): Promise<VexiConfig | null> {
  const raw = await readJson<unknown>(CONFIG_PATH);
  if (!raw) return null;
  const result = VexiConfigSchema.safeParse(raw);
  if (!result.success) {
    process.stderr.write(`[vexi] config validation failed: ${result.error.message}\n`);
    return null;
  }
  return result.data as VexiConfig;
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
