import { describe, it, expect } from 'vitest';
import { UsageTracker, priceForModel, estimateCost } from './index.js';

describe('priceForModel', () => {
  it('matches the most specific prefix (mini before base)', () => {
    expect(priceForModel('gpt-4o-mini')).toEqual({ in: 0.15, out: 0.6 });
    expect(priceForModel('gpt-4o-2024-08-06')).toEqual({ in: 2.5, out: 10 });
  });

  it('prices known free-tier models at zero', () => {
    expect(priceForModel('gemini-2.5-flash')).toEqual({ in: 0, out: 0 });
    expect(priceForModel('glm-4-flash')).toEqual({ in: 0, out: 0 });
  });

  it('returns null for unknown models', () => {
    expect(priceForModel('some-random-model')).toBeNull();
  });
});

describe('estimateCost', () => {
  it('computes cost from per-million pricing', () => {
    // 1M input @ $3, 1M output @ $15 => $18
    expect(estimateCost('claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(18);
  });

  it('returns null when the model is unpriced', () => {
    expect(estimateCost('mystery', { inputTokens: 100, outputTokens: 100 })).toBeNull();
  });
});

describe('UsageTracker', () => {
  it('accumulates across turns and ignores empty usage', () => {
    const t = new UsageTracker();
    t.add({ inputTokens: 100, outputTokens: 50 });
    t.add({ inputTokens: 0, outputTokens: 0 }); // ignored
    t.add({ inputTokens: 200, outputTokens: 80 });
    expect(t.totals).toEqual({ inputTokens: 300, outputTokens: 130 });
    expect(t.hasData).toBe(true);
  });

  it('summarizes with a cost estimate for priced models', () => {
    const t = new UsageTracker();
    t.add({ inputTokens: 1000, outputTokens: 500 });
    const summary = t.summary('gpt-4o-mini');
    expect(summary).toContain('1,500 tokens');
    expect(summary).toContain('~$');
  });

  it('omits cost for unpriced models but still shows tokens', () => {
    const t = new UsageTracker();
    t.add({ inputTokens: 1000, outputTokens: 500 });
    const summary = t.summary('mystery-model');
    expect(summary).toContain('1,500 tokens');
    expect(summary).not.toContain('$');
  });

  it('reports no data before any usage', () => {
    expect(new UsageTracker().hasData).toBe(false);
  });
});
