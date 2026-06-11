/**
 * Open a file or URL with the OS default application (cross-platform).
 */

import { exec } from 'node:child_process';
import { platform } from 'node:os';

export function openInDefaultApp(path: string): void {
  const os = platform();
  // Quote the path; on Windows `start` needs an empty title argument.
  const cmd =
    os === 'win32'
      ? `start "" "${path}"`
      : os === 'darwin'
        ? `open "${path}"`
        : `xdg-open "${path}"`;
  exec(cmd, () => {
    // Best effort — if it fails the user still has the file path printed.
  });
}
