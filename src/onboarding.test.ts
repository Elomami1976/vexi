import { describe, it, expect, vi } from 'vitest';
import { runOnboarding } from './onboarding.js';
import type { OnboardingIO } from './onboarding.js';

function makeIO(answers: string[]): { io: OnboardingIO; lines: string[] } {
  const lines: string[] = [];
  let callIndex = 0;
  const io: OnboardingIO = {
    prompt: async (_q: string) => answers[callIndex++] ?? '',
    write: (line: string) => lines.push(line),
  };
  return { io, lines };
}

describe('runOnboarding', () => {
  it('happy path: discovers models and saves config', async () => {
    const { io } = makeIO([
      'https://openrouter.ai/api/v1',   // URL
      'sk-or-test',                       // API key
      '1',                                // pick model #1
    ]);

    const discoverFn = vi.fn().mockResolvedValue(['openai/gpt-4o', 'mistralai/mistral-7b']);
    const saveFn = vi.fn().mockResolvedValue(undefined);

    const config = await runOnboarding(io, discoverFn, saveFn);

    expect(config.provider).toBe('openrouter');
    expect(config.displayName).toBe('OpenRouter');
    expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(config.apiKey).toBe('sk-or-test');
    expect(config.model).toBe('openai/gpt-4o');

    expect(discoverFn).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openrouter' }),
      'sk-or-test',
    );
    expect(saveFn).toHaveBeenCalledWith(config);
  });

  it('falls back to manual model entry when /models fails', async () => {
    const { io } = makeIO([
      'https://api.groq.com/openai/v1',  // URL
      'gsk_test',                          // API key
      'llama-3.3-70b-versatile',           // manual model entry
    ]);

    const discoverFn = vi.fn().mockRejectedValue(new Error('HTTP 401. Enter the model ID manually.'));
    const saveFn = vi.fn().mockResolvedValue(undefined);

    const config = await runOnboarding(io, discoverFn, saveFn);

    expect(config.model).toBe('llama-3.3-70b-versatile');
    expect(saveFn).toHaveBeenCalledWith(config);
  });

  it('throws when no URL is provided', async () => {
    const { io } = makeIO(['']);  // empty URL
    await expect(runOnboarding(io, vi.fn(), vi.fn())).rejects.toThrow('No URL provided');
  });

  it('throws when no API key is provided', async () => {
    const { io } = makeIO([
      'https://openrouter.ai/api/v1',   // valid URL
      '',                                 // empty API key
    ]);
    const discoverFn = vi.fn().mockResolvedValue([]);
    await expect(runOnboarding(io, discoverFn, vi.fn())).rejects.toThrow('No API key provided');
  });

  it('accepts a typed model id directly instead of a number', async () => {
    const { io } = makeIO([
      'https://api.openai.com/v1',
      'sk-test',
      'o3-mini',   // typed directly, not a list number
    ]);

    const discoverFn = vi.fn().mockResolvedValue(['gpt-4o', 'gpt-4o-mini']);
    const saveFn = vi.fn().mockResolvedValue(undefined);

    const config = await runOnboarding(io, discoverFn, saveFn);
    expect(config.model).toBe('o3-mini');
  });

  it('defaults to first model when empty choice given', async () => {
    const { io } = makeIO([
      'https://api.openai.com/v1',
      'sk-test',
      '',  // empty → default to first
    ]);

    const discoverFn = vi.fn().mockResolvedValue(['gpt-4o', 'gpt-4o-mini']);
    const saveFn = vi.fn().mockResolvedValue(undefined);

    const config = await runOnboarding(io, discoverFn, saveFn);
    expect(config.model).toBe('gpt-4o');
  });
});
