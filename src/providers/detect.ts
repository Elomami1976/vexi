/**
 * API key → provider auto-detection.
 *
 * Key formats change over time, so all patterns live in this single file
 * and are intentionally loose (prefix-based). To support a new key format,
 * just add/update an entry in PROVIDER_PATTERNS below.
 */

import type { ProviderId } from './types.js';

/**
 * Ordered list of detection patterns.
 *
 * Patterns are written to be mutually exclusive (the generic OpenAI `sk-`
 * pattern uses a negative lookahead for `sk-ant-` / `sk-or-`), so a key
 * matching more than one pattern is a genuine ambiguity and triggers the
 * interactive fallback.
 */
export const PROVIDER_PATTERNS: ReadonlyArray<{ provider: ProviderId; pattern: RegExp }> = [
  { provider: 'anthropic', pattern: /^sk-ant-/ },
  { provider: 'openrouter', pattern: /^sk-or-/ },
  { provider: 'groq', pattern: /^gsk_/ },
  { provider: 'gemini', pattern: /^AIza/ },
  // OpenAI: classic `sk-...` and new project keys `sk-proj-...`,
  // excluding the Anthropic / OpenRouter prefixes above.
  { provider: 'openai', pattern: /^sk-(?!ant-|or-)/ },
];

/**
 * Sanitize a pasted API key: trim whitespace/newlines and strip
 * surrounding quotes (users often paste keys with extra characters).
 */
export function sanitizeKey(raw: string): string {
  let key = raw.trim();
  // Strip matching surrounding quotes ("key", 'key', `key`)
  while (key.length >= 2 && `"'\``.includes(key[0]) && key[0] === key[key.length - 1]) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

/**
 * Detect the provider for a (sanitized) API key.
 *
 * Returns the provider id when exactly one pattern matches.
 * Returns `null` when zero or multiple patterns match — callers should
 * fall back to asking the user to pick the provider manually.
 */
export function detectProvider(key: string): ProviderId | null {
  const matches = PROVIDER_PATTERNS.filter(({ pattern }) => pattern.test(key));
  return matches.length === 1 ? matches[0].provider : null;
}
