/**
 * Shared async file helpers.
 *
 * All Vexi state files (.vexi/memory.json, .vexi/project.json,
 * ~/.vexi/config.json) are written atomically: write to a temp file in the
 * same directory, then rename. Rename is atomic on POSIX and effectively
 * atomic on NTFS, which prevents corruption when the agent writes memory
 * and session data concurrently.
 */

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Read + parse a JSON file, returning `null` on any error. */
export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Atomically write a JSON file (temp file + rename).
 * Creates parent directories as needed. `mode` applies to the file
 * (e.g. 0o600 for secrets); it is a no-op on Windows.
 */
export async function writeJsonAtomic(
  path: string,
  data: unknown,
  options: { mode?: number; dirMode?: number } = {},
): Promise<void> {
  const dir = dirname(path);
  await fs.mkdir(dir, { recursive: true, mode: options.dirMode ?? 0o755 });

  const tmpPath = join(dir, `.${randomBytes(6).toString('hex')}.tmp`);
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', {
    encoding: 'utf8',
    mode: options.mode ?? 0o644,
  });
  try {
    await fs.rename(tmpPath, path);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }

  if (options.mode !== undefined) {
    // Re-assert permissions in case the file already existed (no-op on Windows).
    await fs.chmod(path, options.mode).catch(() => {});
  }
}
