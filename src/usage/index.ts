/**
 * Token & cost tracking — Feature #3.
 *
 * Vexi is bring-your-own-key, so the user pays the provider directly. This
 * module accumulates the token usage reported by the provider APIs over a
 * session and estimates the dollar cost from a small built-in price table.
 *
 * Cost is best-effort: when a model isn't in the table (or a provider doesn't
 * report usage) we still show token counts and simply omit the dollar figure.
 */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** USD price per 1,000,000 tokens, matched by model-id prefix (longest wins). */
interface Price {
  in: number;
  out: number;
}

const PRICES: Array<{ match: string; price: Price }> = [
  // ── Anthropic ──
  { match: 'claude-opus', price: { in: 15, out: 75 } },
  { match: 'claude-3-opus', price: { in: 15, out: 75 } },
  { match: 'claude-sonnet', price: { in: 3, out: 15 } },
  { match: 'claude-3-5-sonnet', price: { in: 3, out: 15 } },
  { match: 'claude-3-7-sonnet', price: { in: 3, out: 15 } },
  { match: 'claude-haiku', price: { in: 0.8, out: 4 } },
  { match: 'claude-3-5-haiku', price: { in: 0.8, out: 4 } },
  { match: 'claude-3-haiku', price: { in: 0.25, out: 1.25 } },
  // ── OpenAI ──
  { match: 'gpt-4o-mini', price: { in: 0.15, out: 0.6 } },
  { match: 'gpt-4o', price: { in: 2.5, out: 10 } },
  { match: 'gpt-4.1-mini', price: { in: 0.4, out: 1.6 } },
  { match: 'gpt-4.1-nano', price: { in: 0.1, out: 0.4 } },
  { match: 'gpt-4.1', price: { in: 2, out: 8 } },
  { match: 'o4-mini', price: { in: 1.1, out: 4.4 } },
  { match: 'o3-mini', price: { in: 1.1, out: 4.4 } },
  // ── DeepSeek ──
  { match: 'deepseek-chat', price: { in: 0.27, out: 1.1 } },
  { match: 'deepseek-reasoner', price: { in: 0.55, out: 2.19 } },
  // ── Mistral ──
  { match: 'mistral-small', price: { in: 0.2, out: 0.6 } },
  { match: 'mistral-large', price: { in: 2, out: 6 } },
  // ── Known free tiers (default models) — explicitly zero-cost ──
  { match: 'llama-3.3-70b', price: { in: 0, out: 0 } },
  { match: 'gemini-2.5-flash', price: { in: 0, out: 0 } },
  { match: 'gemini-1.5-flash', price: { in: 0, out: 0 } },
  { match: 'glm-4-flash', price: { in: 0, out: 0 } },
  { match: 'qwen-turbo', price: { in: 0, out: 0 } },
  { match: 'moonshot-v1', price: { in: 0, out: 0 } },
  { match: 'minimax', price: { in: 0, out: 0 } },
];

/** Look up the price for a model id, or null when unknown. */
export function priceForModel(model: string): Price | null {
  const id = model.toLowerCase();
  let best: { match: string; price: Price } | null = null;
  for (const entry of PRICES) {
    if (id.includes(entry.match) && (!best || entry.match.length > best.match.length)) {
      best = entry;
    }
  }
  return best?.price ?? null;
}

/** Estimate the USD cost of a usage total for a model, or null when unpriced. */
export function estimateCost(model: string, usage: Usage): number | null {
  const price = priceForModel(model);
  if (!price) return null;
  return (usage.inputTokens * price.in + usage.outputTokens * price.out) / 1_000_000;
}

/** Accumulates token usage across a session. */
export class UsageTracker {
  private input = 0;
  private output = 0;
  private turns = 0;

  add(usage: Usage): void {
    if (usage.inputTokens > 0 || usage.outputTokens > 0) {
      this.input += usage.inputTokens;
      this.output += usage.outputTokens;
      this.turns++;
    }
  }

  get totals(): Usage {
    return { inputTokens: this.input, outputTokens: this.output };
  }

  get hasData(): boolean {
    return this.turns > 0;
  }

  /** A one-line human summary, e.g. "12,340 tokens (8.1k in / 4.2k out) · ~$0.0123". */
  summary(model: string): string {
    if (!this.hasData) return 'No usage reported yet.';
    const total = this.input + this.output;
    const cost = estimateCost(model, this.totals);
    const costPart = cost === null ? '' : ` · ~$${cost.toFixed(4)}`;
    return `${fmt(total)} tokens (${fmt(this.input)} in / ${fmt(this.output)} out)${costPart}`;
  }
}

/** Compact number formatting: 1234 -> "1,234", 12340 -> "12.3k". */
function fmt(n: number): string {
  if (n < 10_000) return n.toLocaleString('en-US');
  return `${(n / 1000).toFixed(1)}k`;
}
