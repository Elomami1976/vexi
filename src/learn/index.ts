/**
 * Vexi Learn — Feature 7 (Phase 5).
 *
 * Vexi adapts to your personal coding style by mining your own recorded
 * sessions (`.vexi/sessions/*.json`, written by the replay recorder).
 * Your corrections to the AI are the strongest signal: "use tabs",
 * "don't use classes", "always answer in Arabic", "prefer fetch over
 * axios" — durable preferences hidden inside everyday messages.
 *
 *   vexi learn           analyze recent sessions, preview the learned style
 *   vexi learn --apply   save it as .vexi/skills/learned-style.md
 *
 * The saved skill is a normal markdown skill file, so it is automatically
 * injected into the system prompt of every future session (Feature 2.5) —
 * the agent literally gets more "you" over time. Everything stays local;
 * the only network call is the one to your own model provider.
 */

import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { listSessions, loadSession } from '../replay/recorder.js';
import type { ChatMessage, Provider } from '../providers/types.js';

/** The skill file Vexi Learn owns (re-running learn overwrites it). */
export const LEARNED_SKILL_NAME = 'learned-style';

/** How many recent sessions to analyze by default. */
export const DEFAULT_MAX_SESSIONS = 10;

/** Per-message and total caps keep the prompt well under context limits. */
const MAX_MSG_LEN = 600;
const MAX_TOTAL_CHARS = 24_000;

/**
 * Heuristics for "correction / preference" messages — the user pushing
 * back or stating a durable rule. Multilingual on purpose (en/es/pt/fr/ar).
 */
const SIGNAL_RE = new RegExp(
  [
    // English
    String.raw`\b(don'?t|do not|stop|never|always|instead( of)?|prefer|rather than|please use|use\s+\S+\s+(not|instead)|no,|actually|wrong|rename|i (like|want|prefer))\b`,
    // Spanish / Portuguese
    String.raw`\b(no uses|en lugar de|prefiero|siempre|nunca|mejor usa|não use|em vez de|prefiro|sempre)\b`,
    // French
    String.raw`\b(n'utilise pas|au lieu de|je préfère|toujours|jamais|plutôt)\b`,
    // Arabic
    String.raw`(لا تستخدم|بدلًا من|بدلا من|أفضّل|افضل|دائمًا|دائما|أبدًا|استخدم)`,
  ].join('|'),
  'iu',
);

/** True when a user message looks like a correction or stated preference. */
export function isPreferenceSignal(message: string): boolean {
  return SIGNAL_RE.test(message);
}

export interface LearnEvidence {
  sessionsAnalyzed: number;
  /** User messages flagged as corrections/preferences (strongest signal). */
  signals: string[];
  /** Remaining user messages, sampled (context for the analyst model). */
  other: string[];
}

/**
 * Collect evidence from recent sessions: every user message, with
 * correction-style messages separated out. Newest sessions first.
 */
export async function gatherEvidence(
  root: string,
  maxSessions = DEFAULT_MAX_SESSIONS,
): Promise<LearnEvidence> {
  const names = (await listSessions(root)).slice(0, maxSessions);
  const signals: string[] = [];
  const other: string[] = [];
  let total = 0;
  let sessionsAnalyzed = 0;

  for (const name of names) {
    const loaded = await loadSession(root, name);
    if (!loaded) continue;
    sessionsAnalyzed++;

    for (const event of loaded.session.events) {
      if (event.role !== 'user') continue;
      const text = event.content.trim().slice(0, MAX_MSG_LEN);
      if (!text || text.startsWith('/')) continue; // skip slash commands
      if (total + text.length > MAX_TOTAL_CHARS) break;
      total += text.length;
      (isPreferenceSignal(text) ? signals : other).push(text);
    }
  }

  return { sessionsAnalyzed, signals, other };
}

const LEARN_PROMPT = `You are a coding-style analyst. Below are real messages a developer
sent to their AI coding agent across past sessions. CORRECTIONS are messages where they
pushed back or stated a rule — these are the strongest evidence of durable preferences.

Extract the developer's PERSONAL CODING STYLE as a markdown skill file that a coding
agent will follow in every future session.

Rules:
- Only include DURABLE preferences (style, naming, libraries, language, formatting,
  testing habits, communication preferences). Ignore one-off task instructions.
- Each preference must be backed by evidence in the messages. Never invent.
- Write in English (the file is consumed by an AI model). Be concise: short bullet
  points grouped under a few ## headings, max ~300 words.
- Start the file with the line: # Learned coding style
- If the messages contain NO durable preferences at all, respond with exactly: NOTHING`;

/** Build the chat messages for the learn call (exported for tests). */
export function buildLearnMessages(evidence: LearnEvidence): ChatMessage[] {
  const sections: string[] = [];
  if (evidence.signals.length > 0) {
    sections.push('CORRECTIONS / STATED PREFERENCES:\n' + evidence.signals.map((m) => `- ${m}`).join('\n'));
  }
  if (evidence.other.length > 0) {
    sections.push('OTHER MESSAGES (context):\n' + evidence.other.map((m) => `- ${m}`).join('\n'));
  }
  return [
    { role: 'system', content: LEARN_PROMPT },
    { role: 'user', content: sections.join('\n\n') },
  ];
}

export interface LearnResult {
  /** The learned skill markdown, or null when there was nothing to learn. */
  markdown: string | null;
  evidence: LearnEvidence;
}

/**
 * Analyze recent sessions and distill the user's coding style.
 * Returns `markdown: null` when there are no sessions or no durable signal.
 */
export async function learn(
  provider: Provider,
  root: string,
  maxSessions = DEFAULT_MAX_SESSIONS,
): Promise<LearnResult> {
  const evidence = await gatherEvidence(root, maxSessions);
  if (evidence.signals.length === 0 && evidence.other.length === 0) {
    return { markdown: null, evidence };
  }

  const raw = (await provider.stream(buildLearnMessages(evidence), () => {})).trim();
  if (!raw || /^NOTHING\b/i.test(raw)) {
    return { markdown: null, evidence };
  }

  // Strip accidental markdown fences around the whole reply.
  const markdown = raw.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/m, '$1').trim();
  return { markdown, evidence };
}

/**
 * Save the learned style as a regular skill file so it is injected into
 * every future session. Returns the absolute file path.
 */
export async function applyLearned(root: string, markdown: string): Promise<string> {
  const dir = join(root, '.vexi', 'skills');
  await fs.mkdir(dir, { recursive: true });
  const path = join(dir, `${LEARNED_SKILL_NAME}.md`);
  await fs.writeFile(path, markdown.trim() + '\n', 'utf8');
  return path;
}
