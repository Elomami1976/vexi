/**
 * Provider factory: builds the right streaming client for a given
 * provider id + API key.
 */

import type { Provider, ProviderId } from './types.js';
import { PROVIDER_INFO } from './types.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatProvider } from './openai-compat.js';
import type { VexiConfig } from '../config.js';

export { detectProvider, sanitizeKey, PROVIDER_PATTERNS } from './detect.js';
export { PROVIDER_INFO, ProviderError } from './types.js';
export type { ChatMessage, Provider, ProviderId } from './types.js';

/** Base URLs for the OpenAI-compatible providers. */
const BASE_URLS: Partial<Record<ProviderId, string>> = {
  // ── International ────────────────────────────────────────────────────
  openai:    'https://api.openai.com/v1',
  openrouter:'https://openrouter.ai/api/v1',
  groq:      'https://api.groq.com/openai/v1',
  gemini:    'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral:   'https://api.mistral.ai/v1',
  cerebras:  'https://api.cerebras.ai/v1',
  // ── Chinese AI ───────────────────────────────────────────────────────
  glm:       'https://open.bigmodel.cn/api/paas/v4',           // Zhipu AI — GLM-4-Flash free
  deepseek:  'https://api.deepseek.com/v1',                    // DeepSeek V3 — very cheap, free credits
  qwen:      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', // Alibaba Qwen — international
  moonshot:  'https://api.moonshot.cn/v1',                     // Kimi — free quota on signup
  minimax:   'https://api.minimax.chat/v1',                    // MiniMax-Text-01 — free tier
};

export function createProvider(id: ProviderId, apiKey: string, model?: string): Provider {
  const resolvedModel = model ?? PROVIDER_INFO[id].defaultModel;

  if (id === 'anthropic') {
    return createAnthropicProvider(apiKey, resolvedModel);
  }

  const extraHeaders: Record<string, string> | undefined =
    id === 'openrouter'
      ? { 'HTTP-Referer': 'https://vexi.pro', 'X-Title': 'Vexi' }
      : undefined;

  return createOpenAICompatProvider({
    id,
    baseUrl: BASE_URLS[id]!,
    apiKey,
    model: resolvedModel,
    extraHeaders,
  });
}

/**
 * Create a provider from a VexiConfig produced by `vexi setup`.
 * When config.baseUrl is set, uses it directly (URL-based routing).
 * Falls back to the ProviderId-based createProvider for old configs.
 */
export function createProviderFromConfig(config: VexiConfig): Provider {
  if (!config.baseUrl) {
    // Old-style config: route by ProviderId
    return createProvider(config.provider as ProviderId, config.apiKey, config.model);
  }

  const model = config.model ?? 'gpt-4o';

  if (config.provider === 'anthropic') {
    return createAnthropicProvider(config.apiKey, model, config.baseUrl);
  }

  const extraHeaders: Record<string, string> | undefined =
    config.provider === 'openrouter'
      ? { 'HTTP-Referer': 'https://vexi.pro', 'X-Title': 'Vexi' }
      : undefined;

  // Z.ai GLM-5 models support reasoning_effort for extended thinking
  const extraBody: Record<string, unknown> | undefined =
    model.startsWith('z-ai/glm-5') ? { reasoning_effort: 'high' } : undefined;

  return createOpenAICompatProvider({
    id: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model,
    extraHeaders,
    extraBody,
  });
}
