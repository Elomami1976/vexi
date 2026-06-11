/**
 * Session recorder — Feature 3 (Vexi Replay), recording side.
 *
 * Every chat session is automatically recorded to
 * `.vexi/sessions/YYYY-MM-DD-HHmm.json`: user messages, AI responses and
 * timestamps. Files are written atomically after every turn so a crash
 * never loses more than the in-flight message.
 *
 * The export side (standalone HTML with playback) lives in ./export.ts.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic, readJson } from '../utils/fs-atomic.js';

export interface SessionEvent {
  role: 'user' | 'assistant';
  content: string;
  /** ms since session start (compact + perfect for replay timing). */
  at: number;
}

export interface SessionRecord {
  version: 1;
  startedAt: string; // ISO
  project: string;
  provider: string;
  model: string;
  lang: string;
  events: SessionEvent[];
}

function sessionsDir(root: string): string {
  return join(root, '.vexi', 'sessions');
}

/** `2026-06-10-1432` style stamp for session file names. */
function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

export class SessionRecorder {
  private readonly record: SessionRecord;
  private readonly path: string;
  private readonly t0: number;
  private dirty = false;
  private saving = false;

  constructor(root: string, meta: { project: string; provider: string; model: string; lang: string }) {
    const now = new Date();
    this.t0 = now.getTime();
    this.record = {
      version: 1,
      startedAt: now.toISOString(),
      ...meta,
      events: [],
    };
    this.path = join(sessionsDir(root), `${stamp(now)}.json`);
  }

  /** Record one message. Call `save()` afterwards (it's debounced). */
  add(role: 'user' | 'assistant', content: string): void {
    this.record.events.push({ role, content, at: Date.now() - this.t0 });
    this.dirty = true;
  }

  /**
   * Persist to disk (atomic). Serialized so concurrent calls can't race;
   * best-effort — recording must never break the chat loop.
   */
  async save(): Promise<void> {
    if (!this.dirty || this.saving || this.record.events.length === 0) return;
    this.saving = true;
    this.dirty = false;
    try {
      await writeJsonAtomic(this.path, this.record);
    } catch {
      // best effort
    } finally {
      this.saving = false;
    }
  }
}

/** List recorded session file names (newest first). */
export async function listSessions(root: string): Promise<string[]> {
  const entries = await fs.readdir(sessionsDir(root)).catch(() => []);
  return entries
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
}

/** Load a session by file name, or the most recent one when omitted. */
export async function loadSession(root: string, name?: string): Promise<{ name: string; session: SessionRecord } | null> {
  const file = name ?? (await listSessions(root))[0];
  if (!file) return null;
  const session = await readJson<SessionRecord>(join(sessionsDir(root), file));
  if (!session || session.version !== 1 || !Array.isArray(session.events)) return null;
  return { name: file, session };
}
