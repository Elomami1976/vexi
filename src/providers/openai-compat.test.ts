import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOpenAICompatProvider } from './openai-compat.js';

/** Build a fake fetch Response whose body streams the given SSE lines. */
function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const l of lines) controller.enqueue(enc.encode(`data: ${l}\n`));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

afterEach(() => vi.restoreAllMocks());

describe('openai-compat streamTools', () => {
  it('reassembles a tool call split across streamed deltas', async () => {
    const chunks = [
      JSON.stringify({ choices: [{ delta: { content: 'let me edit' } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'edit_file' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"a.ts",' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"old":"x","new":"y"}' } }] } }] }),
      '[DONE]',
    ];
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(chunks)));

    const provider = createOpenAICompatProvider({
      id: 'openai', baseUrl: 'https://x/v1', apiKey: 'k', model: 'gpt', supportsTools: true,
    });
    let streamed = '';
    const { text, toolCalls } = await provider.streamTools!(
      [{ role: 'user', content: 'go' }],
      [{ name: 'edit_file', description: 'd', inputSchema: { type: 'object' } }],
      (c) => { streamed += c; },
    );

    expect(streamed).toBe('let me edit');
    expect(text).toBe('let me edit');
    expect(toolCalls).toEqual([
      { id: 'call_1', name: 'edit_file', arguments: { path: 'a.ts', old: 'x', new: 'y' } },
    ]);
  });

  it('returns no tool calls for a plain text answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }),
      '[DONE]',
    ])));
    const provider = createOpenAICompatProvider({
      id: 'openai', baseUrl: 'https://x/v1', apiKey: 'k', model: 'gpt', supportsTools: true,
    });
    const { text, toolCalls } = await provider.streamTools!([{ role: 'user', content: 'hi' }], [], () => {});
    expect(text).toBe('hi');
    expect(toolCalls).toEqual([]);
  });

  it('reports token usage from the final include_usage chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: 7 } }),
      '[DONE]',
    ])));
    const provider = createOpenAICompatProvider({ id: 'openai', baseUrl: 'x', apiKey: 'k', model: 'gpt' });
    let usage: { inputTokens: number; outputTokens: number } | null = null;
    await provider.stream([{ role: 'user', content: 'hi' }], () => {}, (u) => { usage = u; });
    expect(usage).toEqual({ inputTokens: 42, outputTokens: 7 });
  });

  it('advertises native tool support via the flag', () => {
    const p = createOpenAICompatProvider({ id: 'openai', baseUrl: 'x', apiKey: 'k', model: 'gpt', supportsTools: true });
    expect(p.supportsTools).toBe(true);
    const noTools = createOpenAICompatProvider({ id: 'minimax', baseUrl: 'x', apiKey: 'k', model: 'm' });
    expect(noTools.supportsTools).toBe(false);
  });
});
