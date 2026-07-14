/**
 * Streaming client for OpenAI-compatible chat completion APIs.
 *
 * Used for: OpenAI, OpenRouter, Groq, and Google Gemini (via its
 * OpenAI-compatibility endpoint). All of these speak the same
 * `POST /chat/completions` + Server-Sent Events protocol, which keeps
 * Vexi dependency-free (plain `fetch`, no SDKs).
 */

import { ProviderError } from './types.js';
import type { ChatMessage, Provider, StreamResult, ToolCall, ToolDefinition, UsageSink } from './types.js';

/** Report OpenAI-style `usage` ({prompt_tokens, completion_tokens}) if present. */
function reportUsage(json: unknown, onUsage?: UsageSink): void {
  if (!onUsage) return;
  const u = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  if (u && (u.prompt_tokens || u.completion_tokens)) {
    onUsage({ inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 });
  }
}

interface OpenAICompatOptions {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  /** True when this provider reliably supports native function-calling. */
  supportsTools?: boolean;
}

/** Translate Vexi's neutral ChatMessage[] into OpenAI chat-completions format. */
function toOpenAIMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

export function createOpenAICompatProvider(opts: OpenAICompatOptions): Provider {
  return {
    id: opts.id,
    model: opts.model,
    supportsTools: opts.supportsTools ?? false,

    async streamTools(
      messages: ChatMessage[],
      tools: ToolDefinition[],
      onText: (text: string) => void,
      onUsage?: UsageSink,
    ): Promise<StreamResult> {
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
            messages: toOpenAIMessages(messages),
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
            stream: true,
            stream_options: { include_usage: true },
            ...opts.extraBody,
          }),
          signal: guard.signal,
        }).catch((err: Error) => {
          throw guard.wrapNetworkError(err);
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '');
          throw new ProviderError(`${opts.id} API error (HTTP ${res.status}): ${truncate(body, 300)}`, res.status);
        }

        let full = '';
        // Streamed tool calls arrive as fragments keyed by their array index;
        // accumulate id/name/arguments across deltas, then parse at the end.
        const acc = new Map<number, { id: string; name: string; args: string }>();
        try {
          for await (const data of sseEvents(res.body)) {
            guard.resetIdleTimer();
            if (data === '[DONE]') break;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta;
              if (delta?.content) {
                full += delta.content;
                onText(delta.content);
              }
              if (Array.isArray(delta?.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const cur = acc.get(idx) ?? { id: '', name: '', args: '' };
                  if (tc.id) cur.id = tc.id;
                  if (tc.function?.name) cur.name = tc.function.name;
                  if (tc.function?.arguments) cur.args += tc.function.arguments;
                  acc.set(idx, cur);
                }
              }
              reportUsage(json, onUsage);
            } catch {
              // Ignore malformed/keep-alive chunks
            }
          }
        } catch (e) {
          throw guard.wrapStreamError(e);
        }

        const toolCalls: ToolCall[] = [...acc.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([idx, c]) => {
            let args: Record<string, unknown> = {};
            try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = {}; }
            return { id: c.id || `call_${idx}`, name: c.name, arguments: args };
          })
          .filter((c) => c.name);
        return { text: full, toolCalls };
      } finally {
        guard.dispose();
      }
    },

    async stream(messages: ChatMessage[], onText: (text: string) => void, onUsage?: UsageSink): Promise<string> {
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
            messages: toOpenAIMessages(messages),
            stream: true,
            stream_options: { include_usage: true },
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
              reportUsage(json, onUsage);
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
