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
  // ── Distinctive prefixes (safe auto-detect) ───────────────────────────
  { provider: 'anthropic',  pattern: /^sk-ant-/ },
  { provider: 'openrouter', pattern: /^sk-or-/ },
  { provider: 'groq',       pattern: /^gsk_/ },
  { provider: 'gemini',     pattern: /^AIza/ },
  { provider: 'cerebras',   pattern: /^csk-/ },
  // Zhipu AI (GLM): <32-char-lowercase-hex>.<alphanumeric>
  // e.g. b277fbf3dc1045c79229ff3c65a6f89b.fZ3rWjaTnH6UW6rm
  { provider: 'glm',        pattern: /^[0-9a-f]{32}\.[A-Za-z0-9]+$/ },

  // ── OpenAI project keys (`sk-proj-...`) are distinctive ───────────────
  { provider: 'openai',     pattern: /^sk-proj-/ },

  // ── Ambiguous `sk-` prefix ────────────────────────────────────────────
  // DeepSeek and Moonshot (Kimi) also start with `sk-`, just like classic
  // OpenAI keys. Matching both patterns makes detectProvider() return null
  // (ambiguous) so the user gets the interactive provider-selection prompt
  // instead of silently mis-routing to the wrong API.
  { provider: 'deepseek',   pattern: /^sk-[a-z0-9]{32}$/ },   // sk- + 32 lowercase alphanum
  { provider: 'moonshot',   pattern: /^sk-[A-Za-z0-9]{43,}$/ }, // sk- + 43+ mixed alphanum
  // Classic OpenAI keys (`sk-` without `proj-`, not matching deepseek/moonshot shapes):
  { provider: 'openai',     pattern: /^sk-(?!proj-|ant-|or-)/ },

  // Qwen (DashScope), Mistral, MiniMax have no distinctive key prefix →
  // they always fall back to the interactive provider-selection list.
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
