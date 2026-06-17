/**
 * Snapshot engine for undo/redo of AI file edits.
 *
 * Before executing any shell command that looks like a file write, Vexi
 * saves a copy of only the affected files into:
 *
 *   .vexi/snapshots/<session-id>/<entry-id>/files/<encoded-path>
 *
 * State (undo/redo stacks) is persisted in:
 *   .vexi/snapshots/<session-id>/state.json
 *
 * The active session is tracked in:
 *   .vexi/snapshots/current-session
 *
 * Design choices:
 * - Only snapshots files it is about to change (NOT the whole project tree).
 * - Max 50 snapshots per session; oldest pruned automatically.
 * - Undo restores the pre-command file state; redo re-applies the reverted state.
 * - New files created by a command are not deleted on undo (limitation v1).
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, isAbsolute, relative, dirname } from 'node:path';
import { writeJsonAtomic, readJson } from '../utils/fs-atomic.js';

export interface SnapshotEntry {
  id: string;
  at: number;
  label: string;
  files: string[];  // relative paths from project root
}

interface SnapshotState {
  sessionId: string;
  undoStack: string[];   // entry ids, oldest first / newest last
  redoStack: string[];   // entry ids pushed when undo happens; cleared on new edit
  entries: Record<string, SnapshotEntry>;
}

const MAX_SNAPSHOTS = 50;

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function encodeRelPath(relPath: string): string {
  return relPath.replace(/[\\/]/g, '__').replace(/:/g, '_C_');
}

export class SnapshotManager {
  private root: string;
  readonly sessionId: string;
  private sessionDir: string;
  private statePath: string;
  private _state: SnapshotState | null = null;

  constructor(root: string, sessionId: string) {
    this.root = root;
    this.sessionId = sessionId;
    this.sessionDir = join(root, '.vexi', 'snapshots', sessionId);
    this.statePath = join(this.sessionDir, 'state.json');
  }

  /** Create a manager pointing at the most-recently registered session. */
  static async forCurrentSession(root: string): Promise<SnapshotManager | null> {
    const markerPath = join(root, '.vexi', 'snapshots', 'current-session');
    try {
      const id = (await fs.readFile(markerPath, 'utf-8')).trim();
      if (id) return new SnapshotManager(root, id);
    } catch {}
    return null;
  }

  /** Write the "current-session" marker so CLI commands can find this session. */
  async registerAsCurrentSession(): Promise<void> {
    const markerPath = join(this.root, '.vexi', 'snapshots', 'current-session');
    await fs.mkdir(dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, this.sessionId, 'utf-8');
  }

  private async getState(): Promise<SnapshotState> {
    if (this._state) return this._state;
    const loaded = await readJson<SnapshotState>(this.statePath);
    this._state = loaded ?? {
      sessionId: this.sessionId,
      undoStack: [],
      redoStack: [],
      entries: {},
    };
    return this._state;
  }

  private async persistState(): Promise<void> {
    if (this._state) await writeJsonAtomic(this.statePath, this._state);
  }

  private async saveFiles(id: string, relPaths: string[]): Promise<string[]> {
    const dir = join(this.sessionDir, id, 'files');
    await fs.mkdir(dir, { recursive: true });
    const saved: string[] = [];
    for (const rel of relPaths) {
      const abs = isAbsolute(rel) ? rel : join(this.root, rel);
      if (!existsSync(abs)) continue;
      await fs.copyFile(abs, join(dir, encodeRelPath(rel)));
      saved.push(rel);
    }
    return saved;
  }

  private async restoreFiles(id: string, relPaths: string[]): Promise<void> {
    const dir = join(this.sessionDir, id, 'files');
    for (const rel of relPaths) {
      const dest = isAbsolute(rel) ? rel : join(this.root, rel);
      try {
        await fs.copyFile(join(dir, encodeRelPath(rel)), dest);
      } catch {}
    }
  }

  private async deleteEntry(state: SnapshotState, id: string): Promise<void> {
    delete state.entries[id];
    await fs.rm(join(this.sessionDir, id), { recursive: true, force: true }).catch(() => {});
  }

  /**
   * Save the current state of `files` before applying an edit.
   * Call this right before running the shell command.
   * Returns true if at least one file was snapshotted.
   */
  async takeSnapshot(files: string[], label: string): Promise<boolean> {
    if (files.length === 0) return false;
    const state = await this.getState();

    const id = makeId();
    const saved = await this.saveFiles(id, files);
    if (saved.length === 0) return false;

    state.entries[id] = { id, at: Date.now(), label, files: saved };
    state.undoStack.push(id);
    state.redoStack = [];  // new edit invalidates redo history

    while (state.undoStack.length > MAX_SNAPSHOTS) {
      await this.deleteEntry(state, state.undoStack.shift()!);
    }

    await this.persistState();
    return true;
  }

  /** Restore the last snapshotted file state. Returns the reverted entry, or null if nothing to undo. */
  async undo(): Promise<SnapshotEntry | null> {
    const state = await this.getState();
    if (state.undoStack.length === 0) return null;

    const id = state.undoStack[state.undoStack.length - 1];
    const entry = state.entries[id];
    if (!entry) return null;

    // Save current (post-edit) state as a redo point covering the same files
    const redoId = makeId();
    const redoSaved = await this.saveFiles(redoId, entry.files);
    if (redoSaved.length > 0) {
      state.entries[redoId] = { id: redoId, at: Date.now(), label: entry.label, files: redoSaved };
      state.redoStack.push(redoId);
    }

    await this.restoreFiles(id, entry.files);
    state.undoStack.pop();
    await this.deleteEntry(state, id);
    await this.persistState();
    return entry;
  }

  /** Re-apply the last undone change. Returns the re-applied entry, or null if nothing to redo. */
  async redo(): Promise<SnapshotEntry | null> {
    const state = await this.getState();
    if (state.redoStack.length === 0) return null;

    const id = state.redoStack[state.redoStack.length - 1];
    const entry = state.entries[id];
    if (!entry) return null;

    // Save current (post-undo) state back onto the undo stack
    const undoId = makeId();
    const undoSaved = await this.saveFiles(undoId, entry.files);
    if (undoSaved.length > 0) {
      state.entries[undoId] = { id: undoId, at: Date.now(), label: entry.label, files: undoSaved };
      state.undoStack.push(undoId);
    }

    await this.restoreFiles(id, entry.files);
    state.redoStack.pop();
    await this.deleteEntry(state, id);
    await this.persistState();
    return entry;
  }

  /** List all available undo entries, newest first. */
  async list(): Promise<SnapshotEntry[]> {
    const state = await this.getState();
    return [...state.undoStack]
      .reverse()
      .map((id) => state.entries[id])
      .filter(Boolean);
  }

  /** Remove all snapshot sessions except this one (and the current-session marker). */
  async clean(): Promise<number> {
    return SnapshotManager.cleanAll(this.root, this.sessionId);
  }

  /** Remove all snapshot session directories, optionally keeping one by ID. */
  static async cleanAll(root: string, keepSessionId?: string): Promise<number> {
    const snapshotsDir = join(root, '.vexi', 'snapshots');
    let count = 0;
    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (keepSessionId && entry.name === keepSessionId) continue;
        try {
          await fs.rm(join(snapshotsDir, entry.name), { recursive: true, force: true });
          count++;
        } catch {}
      }
    } catch {}
    return count;
  }

  /**
   * Extract file paths that a shell command is likely to write.
   * Returns relative paths (relative to cwd) for files that currently exist on disk.
   * This is best-effort: covers common patterns (cat >, sed -i, mv, cp, tee, etc.)
   * and files with known extensions that appear as bare tokens in the command.
   */
  static extractFilePaths(command: string, cwd: string): string[] {
    const found = new Set<string>();

    const tryAdd = (raw: string | undefined) => {
      if (!raw) return;
      const p = raw.trim().replace(/^["']|["']$/g, '');
      if (!p || p.startsWith('-') || p.startsWith('http') || p === '/dev/null') return;
      const abs = isAbsolute(p) ? p : join(cwd, p);
      if (existsSync(abs)) {
        found.add(relative(cwd, abs).replace(/\\/g, '/'));
      }
    };

    // cat > file  /  cat >> file
    for (const m of command.matchAll(/\bcat\s+>>?\s+(\S+)/gi)) tryAdd(m[1]);
    // echo ... > file  /  >> file
    for (const m of command.matchAll(/\becho\b.*?>>?\s+(\S+)/gi)) tryAdd(m[1]);
    // sed -i[suffix] 'expr' file
    for (const m of command.matchAll(/\bsed\b.*?-i\S*\s+(?:'[^']*'|"[^"]*"|\S+)\s+(\S+)/gi)) tryAdd(m[1]);
    // patch [options] file
    for (const m of command.matchAll(/\bpatch\b(?:\s+-[a-zA-Z0-9]+)*\s+(\S+)/gi)) tryAdd(m[1]);
    // tee file
    for (const m of command.matchAll(/\btee\s+(\S+)/gi)) tryAdd(m[1]);
    // cp src dst
    for (const m of command.matchAll(/\bcp\b(?:\s+-[a-zA-Z]+)*\s+(\S+)\s+(\S+)/gi)) {
      tryAdd(m[1]); tryAdd(m[2]);
    }
    // mv src dst
    for (const m of command.matchAll(/\bmv\b(?:\s+-[a-zA-Z]+)*\s+(\S+)\s+(\S+)/gi)) {
      tryAdd(m[1]); tryAdd(m[2]);
    }
    // node/deno: fs.writeFileSync('file', ...)
    for (const m of command.matchAll(/writeFileSync\s*\(\s*["']([^"']+)["']/gi)) tryAdd(m[1]);
    // python: open('file', 'w') or open('file', 'a')
    for (const m of command.matchAll(/\bopen\s*\(\s*["']([^"']+)["']\s*,\s*["'][wa]/gi)) tryAdd(m[1]);
    // PowerShell: Set-Content / Out-File / Add-Content
    for (const m of command.matchAll(/\b(?:Set-Content|Out-File|Add-Content)\b.*?-(?:Path|Value|FilePath)\s+["']?(\S+?)["']?(?:\s|$)/gi)) tryAdd(m[1]);
    // Generic: bare token with a known source-file extension
    for (const m of command.matchAll(/(?:^|[\s;|&>])["']?([\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|java|c|cpp|h|hpp|css|scss|html|yaml|yml|toml|sh|env|txt|xml|sql|graphql|vue|svelte|rb|php|swift|kt|cs))["']?(?=\s|$|[;|&])/gim)) tryAdd(m[1]);

    return [...found];
  }
}
