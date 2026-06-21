/**
 * Streaming client for OpenAI-compatible chat completion APIs.
 *
 * Used for: OpenAI, OpenRouter, Groq, and Google Gemini (via its
 * OpenAI-compatibility endpoint). All of these speak the same
 * `POST /chat/completions` + Server-Sent Events protocol, which keeps
 * Vexi dependency-free (plain `fetch`, no SDKs).
 */

import { ProviderError } from './types.js';
import type { ChatMessage, Provider } from './types.js';

interface OpenAICompatOptions {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

export function createOpenAICompatProvider(opts: OpenAICompatOptions): Provider {
  return {
    id: opts.id,
    model: opts.model,

    async stream(messages: ChatMessage[], onText: (text: string) => void): Promise<string> {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
          ...opts.extraHeaders,
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream: true,
          ...opts.extraBody,
        }),
      }).catch((err: Error) => {
        throw new ProviderError(`Network error: ${err.message}`);
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new ProviderError(
          `${opts.id} API error (HTTP ${res.status}): ${truncate(body, 300)}`,
          res.status,
        );
      }

      let full = '';
      for await (const data of sseEvents(res.body)) {
        if (data === '[DONE]') break;
        try {
          const json = JSON.parse(data);
          const text: string | undefined = json.choices?.[0]?.delta?.content;
          if (text) {
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

/**
 * Parse a Server-Sent Events byte stream and yield each `data:` payload.
 * Shared by all providers (exported for the Anthropic client too).
 */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith('data:')) {
          yield line.slice(5).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
