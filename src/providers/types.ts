/**
 * Shared types for AI providers.
 */

export type ProviderId =
  | 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini'
  | 'glm' | 'mistral' | 'cerebras'
  | 'deepseek' | 'qwen' | 'moonshot' | 'minimax';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Provider {
  id: ProviderId;
  model: string;
  /**
   * Send a conversation and stream the assistant reply.
   * `onText` is called for every text chunk as it arrives.
   * Resolves with the full assistant message.
   */
  stream(messages: ChatMessage[], onText: (text: string) => void): Promise<string>;
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
  anthropic:  { label: 'Anthropic (Claude)',              defaultModel: 'claude-sonnet-4-5' },
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
