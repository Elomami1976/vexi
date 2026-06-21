/**
 * Context Compression Engine — Feature 1 (Running Summary approach).
 *
 * Problem: in long sessions the conversation outgrows the context window.
 * Naively deleting old messages makes the model forget earlier decisions.
 *
 * Strategy:
 * - Recent messages always stay in full (KEEP_RECENT).
 * - Every COMPRESS_INTERVAL messages, older messages are folded into a
 *   "running summary" + a list of key decision points, produced by the
 *   model itself (e.g. "User chose JWT for authentication").
 * - The summary is persisted per-project in .vexi/memory.json (atomic
 *   writes) and loaded automatically on every session start, so Vexi
 *   never forgets previous decisions — even across sessions.
 */

import { join } from 'node:path';
import { z } from 'zod';
import { readJson, writeJsonAtomic } from '../utils/fs-atomic.js';
import type { ChatMessage, Provider } from '../providers/types.js';

/** Messages that always stay in the context verbatim. */
export const KEEP_RECENT = 10;

/** Compress after this many new messages accumulate beyond KEEP_RECENT. */
export const COMPRESS_INTERVAL = 6;

export interface ProjectMemory {
  version: 1;
  /** Running prose summary of the conversation so far. */
  summary: string;
  /** Key decision points, e.g. "User chose JWT for authentication". */
  decisions: string[];
  updatedAt: string;
  /** Total messages folded into the summary (across all sessions). */
  compressedCount: number;
}

const EMPTY_MEMORY: ProjectMemory = {
  version: 1,
  summary: '',
  decisions: [],
  updatedAt: '',
  compressedCount: 0,
};

function memoryPath(root: string): string {
  return join(root, '.vexi', 'memory.json');
}

/** Load this project's memory (or an empty one). */
export async function loadMemory(root: string): Promise<ProjectMemory> {
  const memory = await readJson<ProjectMemory>(memoryPath(root));
  return memory && memory.version === 1 ? memory : { ...EMPTY_MEMORY };
}

/** Persist memory atomically. */
export async function saveMemory(root: string, memory: ProjectMemory): Promise<void> {
  await writeJsonAtomic(memoryPath(root), memory);
}

/**
 * Render the memory as a system-prompt block.
 * Returns '' when there is nothing remembered yet.
 */
export function memoryBlock(memory: ProjectMemory): string {
  if (!memory.summary && memory.decisions.length === 0) return '';
  const parts: string[] = ['## Project memory (earlier context, compressed)'];
  if (memory.summary) parts.push(memory.summary);
  if (memory.decisions.length > 0) {
    parts.push('Key decisions:\n' + memory.decisions.map((d) => `- ${d}`).join('\n'));
  }
  return parts.join('\n');
}

/** Prompt used to fold old messages into the running summary. */
const COMPRESS_PROMPT = `You maintain the long-term memory of a coding session.
Merge the EXISTING MEMORY and the NEW MESSAGES below into an updated memory.

Rules:
- Keep it dense and factual; max ~200 words for the summary.
- "decisions" lists durable decision points worth remembering forever
  (e.g. "User chose JWT for authentication", "Database switched to PostgreSQL").
  Carry over old decisions unless they were explicitly reversed; max 20 items.
- Never invent information.

Respond with ONLY valid JSON, no markdown fences:
{"summary": "...", "decisions": ["...", "..."]}`;

/**
 * Fold `oldMessages` into the running summary using the model itself.
 *
 * On any failure the previous memory is returned unchanged — compression
 * is an optimization and must never break the chat loop.
 */
export async function compressIntoMemory(
  provider: Provider,
  memory: ProjectMemory,
  oldMessages: ChatMessage[],
): Promise<ProjectMemory> {
  if (oldMessages.length === 0) return memory;

  const transcript = oldMessages
    .map((m) => `${m.role.toUpperCase()}: ${truncate(m.content, 1500)}`)
    .join('\n\n');

  const existing = memory.summary || memory.decisions.length
    ? `Summary: ${memory.summary || '(none)'}\nDecisions:\n${memory.decisions.map((d) => `- ${d}`).join('\n') || '(none)'}`
    : '(empty)';

  try {
    const raw = await provider.stream(
      [
        { role: 'system', content: COMPRESS_PROMPT },
        {
          role: 'user',
          content: `EXISTING MEMORY:\n${existing}\n\nNEW MESSAGES:\n${transcript}`,
        },
      ],
      () => {}, // silent — no terminal output during compression
    );

    const parsed = extractJson(raw);
    if (!parsed) return memory;

    return {
      version: 1,
      summary: parsed.summary.trim(),
      decisions: parsed.decisions
        .map((d) => d.trim())
        .filter(Boolean)
        .slice(0, 20),
      updatedAt: new Date().toISOString(),
      compressedCount: memory.compressedCount + oldMessages.length,
    };
  } catch {
    return memory; // never let compression break the session
  }
}

const MemoryJsonSchema = z.object({
  summary:   z.string(),
  decisions: z.array(z.string()),
});

/** Extract and validate the first JSON object from a model reply (tolerates fences/prose). */
function extractJson(text: string): z.infer<typeof MemoryJsonSchema> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    const result = MemoryJsonSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
