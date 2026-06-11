/**
 * Provider factory: builds the right streaming client for a given
 * provider id + API key.
 */

import type { Provider, ProviderId } from './types.js';
import { PROVIDER_INFO } from './types.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatProvider } from './openai-compat.js';

export { detectProvider, sanitizeKey, PROVIDER_PATTERNS } from './detect.js';
export { PROVIDER_INFO, ProviderError } from './types.js';
export type { ChatMessage, Provider, ProviderId } from './types.js';

/** Base URLs for the OpenAI-compatible providers. */
const BASE_URLS: Partial<Record<ProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  // Gemini's OpenAI-compatibility endpoint
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

export function createProvider(id: ProviderId, apiKey: string, model?: string): Provider {
  const resolvedModel = model ?? PROVIDER_INFO[id].defaultModel;

  if (id === 'anthropic') {
    return createAnthropicProvider(apiKey, resolvedModel);
  }

  const extraHeaders: Record<string, string> | undefined =
    id === 'openrouter'
      ? {
          // OpenRouter attribution headers (optional but recommended)
          'HTTP-Referer': 'https://github.com/Elomami1976/vexi',
          'X-Title': 'Vexi',
        }
      : undefined;

  return createOpenAICompatProvider({
    id,
    baseUrl: BASE_URLS[id]!,
    apiKey,
    model: resolvedModel,
    extraHeaders,
  });
}
