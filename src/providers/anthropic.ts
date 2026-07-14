/**
 * Streaming client for the native Anthropic Messages API.
 * Anthropic separates the system prompt from the messages array,
 * so it gets its own small client instead of the OpenAI-compatible one.
 */

import { ProviderError } from './types.js';
import type { ChatMessage, Provider, StreamResult, ToolCall, ToolDefinition, Usage, UsageSink } from './types.js';
import { sseEvents, truncate, createStreamTimeoutGuard } from './openai-compat.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Accumulate token usage from an Anthropic SSE event. Input tokens arrive in
 * `message_start`; output tokens accumulate in `message_delta`. Returns the
 * running total (mutated in place).
 */
function accumulateUsage(json: { type?: string; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number } }, usage: Usage): void {
  if (json.type === 'message_start' && json.message?.usage) {
    usage.inputTokens = json.message.usage.input_tokens ?? usage.inputTokens;
  } else if (json.type === 'message_delta' && json.usage) {
    usage.outputTokens = json.usage.output_tokens ?? usage.outputTokens;
  }
}

/** Translate Vexi's neutral ChatMessage[] into Anthropic's content-block format. */
function toAnthropicMessages(chat: ChatMessage[]): Array<{ role: string; content: unknown }> {
  return chat.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      return { role: 'assistant', content: blocks };
    }
    if (m.role === 'tool') {
      // Tool results are carried on a user-role turn in Anthropic's API.
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content }],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export function createAnthropicProvider(apiKey: string, model: string, baseUrl?: string): Provider {
  const messagesEndpoint = `${baseUrl ?? ANTHROPIC_BASE}/messages`;
  return {
    id: 'anthropic',
    model,
    supportsTools: true,

    async streamTools(
      messages: ChatMessage[],
      tools: ToolDefinition[],
      onText: (text: string) => void,
      onUsage?: UsageSink,
    ): Promise<StreamResult> {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const chat = messages.filter((m) => m.role !== 'system');
      const usage: Usage = { inputTokens: 0, outputTokens: 0 };

      const guard = createStreamTimeoutGuard('anthropic');
      try {
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
            messages: toAnthropicMessages(chat),
            tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
            stream: true,
          }),
          signal: guard.signal,
        }).catch((err: Error) => {
          throw guard.wrapNetworkError(err);
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '');
          throw new ProviderError(`anthropic API error (HTTP ${res.status}): ${truncate(body, 300)}`, res.status);
        }

        let full = '';
        const toolCalls: ToolCall[] = [];
        // tool_use blocks stream their arguments as partial_json fragments,
        // keyed by content-block index; accumulate then parse at block stop.
        const partials = new Map<number, { id: string; name: string; json: string }>();
        try {
          for await (const data of sseEvents(res.body)) {
            guard.resetIdleTimer();
            try {
              const json = JSON.parse(data);
              if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
                partials.set(json.index, { id: json.content_block.id, name: json.content_block.name, json: '' });
              } else if (json.type === 'content_block_delta') {
                if (json.delta?.type === 'text_delta') {
                  full += json.delta.text;
                  onText(json.delta.text);
                } else if (json.delta?.type === 'input_json_delta') {
                  const p = partials.get(json.index);
                  if (p) p.json += json.delta.partial_json ?? '';
                }
              } else if (json.type === 'content_block_stop') {
                const p = partials.get(json.index);
                if (p) {
                  let args: Record<string, unknown> = {};
                  try { args = p.json ? JSON.parse(p.json) : {}; } catch { args = {}; }
                  toolCalls.push({ id: p.id, name: p.name, arguments: args });
                  partials.delete(json.index);
                }
              }
              accumulateUsage(json, usage);
            } catch {
              // Ignore malformed/keep-alive chunks
            }
          }
        } catch (e) {
          throw guard.wrapStreamError(e);
        }
        if (onUsage) onUsage(usage);
        return { text: full, toolCalls };
      } finally {
        guard.dispose();
      }
    },

    async stream(messages: ChatMessage[], onText: (text: string) => void, onUsage?: UsageSink): Promise<string> {
      // Anthropic takes the system prompt as a top-level field
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
      const chat = messages.filter((m) => m.role !== 'system');
      const usage: Usage = { inputTokens: 0, outputTokens: 0 };

      const guard = createStreamTimeoutGuard('anthropic');
      try {
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
          signal: guard.signal,
        }).catch((err: Error) => {
          throw guard.wrapNetworkError(err);
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '');
          throw new ProviderError(
            `anthropic API error (HTTP ${res.status}): ${truncate(body, 300)}`,
            res.status,
          );
        }

        let full = '';
        try {
          for await (const data of sseEvents(res.body)) {
            guard.resetIdleTimer();
            try {
              const json = JSON.parse(data);
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                const text: string = json.delta.text;
                full += text;
                onText(text);
              }
              accumulateUsage(json, usage);
            } catch {
              // Ignore malformed/keep-alive chunks
            }
          }
        } catch (e) {
          throw guard.wrapStreamError(e);
        }
        if (onUsage) onUsage(usage);
        return full;
      } finally {
        guard.dispose();
      }
    },
  };
}
