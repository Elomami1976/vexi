/**
 * Streaming client for the native Anthropic Messages API.
 * Anthropic separates the system prompt from the messages array,
 * so it gets its own small client instead of the OpenAI-compatible one.
 */

import { ProviderError } from './types.js';
import type { ChatMessage, Provider } from './types.js';
import { sseEvents, truncate } from './openai-compat.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

export function createAnthropicProvider(apiKey: string, model: string, baseUrl?: string): Provider {
  const messagesEndpoint = `${baseUrl ?? ANTHROPIC_BASE}/messages`;
  return {
    id: 'anthropic',
    model,

    async stream(messages: ChatMessage[], onText: (text: string) => void): Promise<string> {
      // Anthropic takes the system prompt as a top-level field
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
      const chat = messages.filter((m) => m.role !== 'system');

      const res = await fetch(messagesEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          ...(system ? { system } : {}),
          messages: chat,
          stream: true,
        }),
      }).catch((err: Error) => {
        throw new ProviderError(`Network error: ${err.message}`);
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new ProviderError(
          `anthropic API error (HTTP ${res.status}): ${truncate(body, 300)}`,
          res.status,
        );
      }

      let full = '';
      for await (const data of sseEvents(res.body)) {
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            const text: string = json.delta.text;
            full += text;
            onText(text);
          }
        } catch {
          // Ignore malformed/keep-alive chunks
        }
      }
      return full;
    },
  };
}
