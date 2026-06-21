import { describe, it, expect } from 'vitest';
import type { ChatMessage, Provider } from '../providers/types.js';
import { compressIntoMemory, KEEP_RECENT, COMPRESS_INTERVAL } from './index.js';

function makeMessages(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `message ${i}`,
  }));
}

const failingProvider: Provider = {
  id: 'openai',
  model: 'gpt-4o',
  stream: async () => { throw new Error('provider failure'); },
};

const emptyMemory = {
  version: 1 as const,
  summary: '',
  decisions: [],
  updatedAt: '',
  compressedCount: 0,
};

describe('Fix 1: maybeCompress data-loss guard', () => {
  it('returns original memory unchanged when provider.stream throws', async () => {
    const messages = makeMessages(KEEP_RECENT + COMPRESS_INTERVAL + 2);
    const original = { ...emptyMemory, summary: 'prior summary' };

    const result = await compressIntoMemory(failingProvider, original, messages);

    expect(result).toBe(original); // same reference — not mutated, not replaced
    expect(result.summary).toBe('prior summary');
  });

  it('returns original memory when provider returns malformed JSON', async () => {
    const badProvider: Provider = {
      id: 'openai',
      model: 'gpt-4o',
      stream: async () => 'this is not json at all',
    };

    const original = { ...emptyMemory, decisions: ['keep this'] };
    const result = await compressIntoMemory(badProvider, original, makeMessages(4));

    expect(result).toBe(original);
    expect(result.decisions).toEqual(['keep this']);
  });

  it('returns updated memory when provider returns valid JSON', async () => {
    const goodProvider: Provider = {
      id: 'openai',
      model: 'gpt-4o',
      stream: async () => '{"summary":"new summary","decisions":["decision A"]}',
    };

    const original = { ...emptyMemory };
    const result = await compressIntoMemory(goodProvider, original, makeMessages(4));

    expect(result).not.toBe(original);
    expect(result.summary).toBe('new summary');
    expect(result.decisions).toEqual(['decision A']);
  });
});
