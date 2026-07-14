import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// config.ts derives VEXI_DIR from os.homedir() at import time, and manifest.ts
// imports VEXI_DIR from it. Mock homedir to a throwaway dir and re-import so the
// cache path is deterministic on every platform (no reliance on $HOME/$USERPROFILE).
let home: string;
let defaultModelFor: typeof import('./manifest.js').defaultModelFor;
let refreshManifest: typeof import('./manifest.js').refreshManifest;

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'vexi-manifest-'));
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    return { ...actual, homedir: () => home };
  });
  const mod = await import('./manifest.js');
  defaultModelFor = mod.defaultModelFor;
  refreshManifest = mod.refreshManifest;
});
afterEach(async () => {
  vi.doUnmock('node:os');
  vi.restoreAllMocks();
  await fs.rm(home, { recursive: true, force: true });
});

async function writeCache(obj: unknown): Promise<void> {
  await fs.mkdir(join(home, '.vexi'), { recursive: true });
  await fs.writeFile(join(home, '.vexi', 'models.json'), JSON.stringify(obj), 'utf8');
}

describe('defaultModelFor', () => {
  it('returns the compiled-in fallback when no cache exists', () => {
    expect(defaultModelFor('openai', 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('prefers a cached remote override', async () => {
    await writeCache({ version: 1, defaults: { openai: 'gpt-5-mini' }, lastCheck: new Date().toISOString() });
    expect(defaultModelFor('openai', 'gpt-4o-mini')).toBe('gpt-5-mini');
    expect(defaultModelFor('anthropic', 'claude-sonnet-5')).toBe('claude-sonnet-5'); // not overridden → fallback
  });

  it('ignores a manifest with an unsupported version', async () => {
    await writeCache({ version: 99, defaults: { openai: 'from-the-future' }, lastCheck: new Date().toISOString() });
    expect(defaultModelFor('openai', 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('ignores malformed cache files', async () => {
    await fs.mkdir(join(home, '.vexi'), { recursive: true });
    await fs.writeFile(join(home, '.vexi', 'models.json'), 'not json', 'utf8');
    expect(defaultModelFor('groq', 'llama-3.3-70b-versatile')).toBe('llama-3.3-70b-versatile');
  });
});

describe('refreshManifest', () => {
  it('fetches and caches a valid manifest, which then feeds defaultModelFor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: 1, defaults: { deepseek: 'deepseek-v4' } }),
    })));
    await refreshManifest();
    expect(defaultModelFor('deepseek', 'deepseek-chat')).toBe('deepseek-v4');
  });

  it('skips the network when the cache is still fresh', async () => {
    await writeCache({ version: 1, defaults: { openai: 'cached' }, lastCheck: new Date().toISOString() });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await refreshManifest();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows network errors and leaves the fallback intact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(refreshManifest()).resolves.toBeUndefined();
    expect(defaultModelFor('openai', 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });
});
