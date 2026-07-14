/**
 * Shared types for AI providers.
 */

export type ProviderId =
  | 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini'
  | 'glm' | 'mistral' | 'cerebras'
  | 'deepseek' | 'qwen' | 'moonshot' | 'minimax';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Native tool calls the assistant requested (native function-calling path only). */
  toolCalls?: ToolCall[];
  /** For a `tool` role message: the id of the call this result answers. */
  toolCallId?: string;
  /** For a `tool` role message: the tool name (some APIs require it). */
  toolName?: string;
}

/** A tool the model may call, described in provider-neutral JSON-Schema form. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object for the tool's arguments. */
  inputSchema: Record<string, unknown>;
}

/** A tool invocation the model requested via native function-calling. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Token usage reported by a provider for one streaming turn. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** Optional callback a provider calls once with the turn's token usage. */
export type UsageSink = (usage: Usage) => void;

/** Result of a tool-enabled streaming turn. */
export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface Provider {
  id: string; // ProviderId for built-in providers, free-form string for URL-based providers
  model: string;
  /**
   * Send a conversation and stream the assistant reply.
   * `onText` is called for every text chunk as it arrives.
   * Resolves with the full assistant message.
   */
  stream(messages: ChatMessage[], onText: (text: string) => void, onUsage?: UsageSink): Promise<string>;
  /**
   * True when this provider/model reliably supports native function-calling.
   * When false (or `streamTools` absent), the agent uses the text-based
   * `vexi-tool` protocol instead.
   */
  supportsTools?: boolean;
  /**
   * Native function-calling variant of `stream`. Sends `tools` to the model
   * and returns any structured tool calls it made alongside the text.
   * Only defined when `supportsTools` is true.
   */
  streamTools?(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onText: (text: string) => void,
    onUsage?: UsageSink,
  ): Promise<StreamResult>;
}

/** Error thrown when a provider API call fails. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** True when the API key is invalid / unauthorized. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Human-friendly provider metadata. */
export const PROVIDER_INFO: Record<ProviderId, { label: string; defaultModel: string; free?: true }> = {
  // ── International providers ───────────────────────────────────────────
  anthropic:  { label: 'Anthropic (Claude)',              defaultModel: 'claude-sonnet-5' },
  openai:     { label: 'OpenAI (GPT)',                    defaultModel: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter',                      defaultModel: 'openrouter/auto' },
  groq:       { label: 'Groq (free tier)',                defaultModel: 'llama-3.3-70b-versatile', free: true },
  gemini:     { label: 'Google Gemini (free tier)',       defaultModel: 'gemini-2.5-flash',         free: true },
  mistral:    { label: 'Mistral AI',                      defaultModel: 'mistral-small-latest' },
  cerebras:   { label: 'Cerebras (free tier)',            defaultModel: 'llama-3.3-70b',            free: true },
  // ── Chinese AI providers ──────────────────────────────────────────────
  glm:        { label: 'Zhipu AI — GLM (free tier)',      defaultModel: 'glm-4-flash',              free: true },
  deepseek:   { label: 'DeepSeek (free tier)',            defaultModel: 'deepseek-chat',             free: true },
  qwen:       { label: 'Alibaba Qwen (free tier)',        defaultModel: 'qwen-turbo',                free: true },
  moonshot:   { label: 'Kimi — Moonshot AI (free tier)',  defaultModel: 'moonshot-v1-8k',            free: true },
  minimax:    { label: 'MiniMax (free tier)',             defaultModel: 'MiniMax-Text-01',           free: true },
};
