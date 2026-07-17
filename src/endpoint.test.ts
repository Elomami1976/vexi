import { describe, it, expect, vi } from 'vitest';
import { identifyFromUrl, discoverModels, verifyConnection } from './endpoint.js';

// ── identifyFromUrl ──────────────────────────────────────────────────────────

describe('identifyFromUrl', () => {
  it('identifies OpenRouter', () => {
    const id = identifyFromUrl('https://openrouter.ai/api/v1');
    expect(id.provider).toBe('openrouter');
    expect(id.displayName).toBe('OpenRouter');
    expect(id.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(id.apiShape).toBe('openai');
    expect(id.modelsUrl).toBe('https://openrouter.ai/api/v1/models');
  });

  it('strips /chat/completions suffix', () => {
    const id = identifyFromUrl('https://openrouter.ai/api/v1/chat/completions');
    expect(id.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('strips trailing slash', () => {
    const id = identifyFromUrl('https://openrouter.ai/api/v1/');
    expect(id.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('identifies Z.ai coding plan', () => {
    const id = identifyFromUrl('https://api.z.ai/coding/v1');
    expect(id.provider).toBe('zai');
    expect(id.displayName).toBe('Z.ai (Coding Plan)');
    expect(id.apiShape).toBe('openai');
  });

  it('identifies Z.ai generic', () => {
    const id = identifyFromUrl('https://api.z.ai/v1');
    expect(id.provider).toBe('zai');
    expect(id.displayName).toBe('Z.ai');
  });

  it('identifies Anthropic', () => {
    const id = identifyFromUrl('https://api.anthropic.com/v1');
    expect(id.provider).toBe('anthropic');
    expect(id.apiShape).toBe('anthropic');
    expect(id.modelsUrl).toBe('https://api.anthropic.com/v1/models');
  });

  it('identifies OpenAI', () => {
    const id = identifyFromUrl('https://api.openai.com/v1');
    expect(id.provider).toBe('openai');
    expect(id.apiShape).toBe('openai');
  });

  it('identifies Groq', () => {
    const id = identifyFromUrl('https://api.groq.com/openai/v1');
    expect(id.provider).toBe('groq');
    expect(id.displayName).toBe('Groq');
  });

  it('identifies localhost as local', () => {
    const id = identifyFromUrl('http://localhost:11434/v1');
    expect(id.provider).toBe('local');
    expect(id.displayName).toBe('Local (OpenAI-compatible)');
    expect(id.modelsUrl).toBe('http://localhost:11434/v1/models');
  });

  it('identifies 192.168.x.x as local', () => {
    const id = identifyFromUrl('http://192.168.1.100:8080/v1');
    expect(id.provider).toBe('local');
  });

  it('identifies Cloudflare and extracts model from path', () => {
    const id = identifyFromUrl('https://api.cloudflare.com/client/v4/accounts/abc123/ai/run/@cf/meta/llama-3.1-8b');
    expect(id.provider).toBe('cloudflare');
    expect(id.displayName).toBe('Cloudflare Workers AI');
    expect(id.modelsUrl).toBeNull();
    expect(id.modelFromPath).toBe('meta/llama-3.1-8b');
  });

  it('classifies unknown public host as custom', () => {
    const id = identifyFromUrl('https://my-proxy.example.com/v1');
    expect(id.provider).toBe('custom');
    expect(id.displayName).toContain('my-proxy.example.com');
    expect(id.apiShape).toBe('openai');
  });

  it('throws on invalid URL', () => {
    expect(() => identifyFromUrl('not-a-url')).toThrow('Invalid URL');
  });
});

// ── discoverModels ────────────────────────────────────────────────────────────

describe('discoverModels', () => {
  it('returns modelFromPath directly without fetching', async () => {
    const identity = {
      provider: 'cloudflare',
      displayName: 'Cloudflare Workers AI',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/abc/ai/run',
      apiShape: 'openai' as const,
      modelsUrl: null,
      modelFromPath: 'meta/llama-3.1-8b',
    };
    const fetchFn = vi.fn();
    const models = await discoverModels(identity, 'key', fetchFn);
    expect(models).toEqual(['meta/llama-3.1-8b']);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty array when modelsUrl is null and no modelFromPath', async () => {
    const identity = {
      provider: 'custom',
      displayName: 'Custom',
      baseUrl: 'https://example.com',
      apiShape: 'openai' as const,
      modelsUrl: null,
    };
    const models = await discoverModels(identity, 'key', vi.fn());
    expect(models).toEqual([]);
  });

  it('fetches /models and maps response data to ids', async () => {
    const identity = {
      provider: 'openrouter',
      displayName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiShape: 'openai' as const,
      modelsUrl: 'https://openrouter.ai/api/v1/models',
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'openai/gpt-4o' }, { id: 'anthropic/claude-3.5-sonnet' }] }),
    });
    const models = await discoverModels(identity, 'sk-test', mockFetch);
    expect(models).toEqual(['openai/gpt-4o', 'anthropic/claude-3.5-sonnet']);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }) }),
    );
  });

  it('uses x-api-key header for Anthropic shape', async () => {
    const identity = {
      provider: 'anthropic',
      displayName: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiShape: 'anthropic' as const,
      modelsUrl: 'https://api.anthropic.com/v1/models',
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'claude-3-5-sonnet-20241022' }] }),
    });
    await discoverModels(identity, 'sk-ant-test', mockFetch);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }),
      }),
    );
  });

  it('throws when /models returns non-OK status', async () => {
    const identity = {
      provider: 'groq',
      displayName: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiShape: 'openai' as const,
      modelsUrl: 'https://api.groq.com/openai/v1/models',
    };
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(discoverModels(identity, 'bad-key', mockFetch)).rejects.toThrow('HTTP 401');
  });
});

// ── verifyConnection ──────────────────────────────────────────────────────────

describe('verifyConnection', () => {
  const openaiIdentity = {
    provider: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiShape: 'openai' as const,
    modelsUrl: 'https://openrouter.ai/api/v1/models',
  };

  const anthropicIdentity = {
    provider: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiShape: 'anthropic' as const,
    modelsUrl: 'https://api.anthropic.com/v1/models',
  };

  const geminiIdentity = {
    provider: 'gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiShape: 'openai' as const,
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
  };

  it('sends a minimal POST to /chat/completions for the openai shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    await verifyConnection(openaiIdentity, 'sk-test', 'openai/gpt-4o', mockFetch);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk-test',
      'content-type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      model: 'openai/gpt-4o',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  });

  it('sends a minimal POST to /messages for the anthropic shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    await verifyConnection(anthropicIdentity, 'sk-ant-test', 'claude-sonnet-5', mockFetch);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  });

  it('throws with status and body on non-ok openai response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid API key"}}',
    });
    await expect(
      verifyConnection(openaiIdentity, 'bad', 'openai/gpt-4o', mockFetch),
    ).rejects.toThrow('Connection test failed: HTTP 401 — {"error":{"message":"Invalid API key"}}');
  });

  it('throws with status and body on non-ok anthropic response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"error":{"message":"model not found"}}',
    });
    await expect(
      verifyConnection(anthropicIdentity, 'sk-ant-test', 'nope', mockFetch),
    ).rejects.toThrow('Connection test failed: HTTP 404 — {"error":{"message":"model not found"}}');
  });

  it('truncates long error bodies to ~300 chars', async () => {
    const longBody = 'x'.repeat(1000);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => longBody,
    });
    await expect(
      verifyConnection(openaiIdentity, 'sk-test', 'gpt-4o', mockFetch),
    ).rejects.toThrow(/HTTP 500 — x{300}…/);
  });

  it('gemini: falls back to native generateContent when compat POST 404s', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
      .mockResolvedValueOnce({ ok: true });

    await verifyConnection(geminiIdentity, 'gm-key', 'gemini-2.0-flash', mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url, init] = mockFetch.mock.calls[1];
    // Native endpoint is a sibling of the /openai compat segment.
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'x-goog-api-key': 'gm-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ contents: [{ parts: [{ text: 'ping' }] }] });
  });

  it('gemini: throws with status and body when both paths fail', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"error":{"message":"API key not valid"}}',
      });

    await expect(
      verifyConnection(geminiIdentity, 'bad-key', 'gemini-2.0-flash', mockFetch),
    ).rejects.toThrow('Connection test failed: HTTP 403 — {"error":{"message":"API key not valid"}}');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gemini: does not fall back on a plain auth failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"invalid credentials"}}',
    });
    await expect(
      verifyConnection(geminiIdentity, 'bad-key', 'gemini-2.0-flash', mockFetch),
    ).rejects.toThrow('HTTP 401');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
