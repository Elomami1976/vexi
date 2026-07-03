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
      const guard = createStreamTimeoutGuard(opts.id);
      try {
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
          signal: guard.signal,
        }).catch((err: Error) => {
          throw guard.wrapNetworkError(err);
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '');
          throw new ProviderError(
            `${opts.id} API error (HTTP ${res.status}): ${truncate(body, 300)}`,
            res.status,
          );
        }

        let full = '';
        try {
          for await (const data of sseEvents(res.body)) {
            guard.resetIdleTimer();
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
        } catch (e) {
          throw guard.wrapStreamError(e);
        }
        return full;
      } finally {
        guard.dispose();
      }
    },
  };
}

/** Abort the connection if the server goes silent for this long between chunks. */
const IDLE_TIMEOUT_MS = 60_000;
/** Hard ceiling on total stream duration, regardless of activity. */
const MAX_STREAM_MS = 10 * 60 * 1000;

/**
 * Shared guard against hung provider connections: aborts the fetch if no
 * bytes arrive for IDLE_TIMEOUT_MS, or if the whole stream runs past
 * MAX_STREAM_MS, so a stalled provider can never freeze the chat loop.
 */
export function createStreamTimeoutGuard(providerId: string) {
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout>;
  const hardTimer = setTimeout(() => controller.abort(), MAX_STREAM_MS);
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
  };
  resetIdleTimer();

  return {
    signal: controller.signal,
    resetIdleTimer,
    wrapNetworkError(err: Error): ProviderError {
      if (controller.signal.aborted) return new ProviderError(`${providerId} request timed out (no response).`);
      return new ProviderError(`Network error: ${err.message}`);
    },
    wrapStreamError(e: unknown): unknown {
      if (controller.signal.aborted) {
        return new ProviderError(`${providerId} stream stalled or exceeded the time limit and was aborted.`);
      }
      return e;
    },
    dispose(): void {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
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
