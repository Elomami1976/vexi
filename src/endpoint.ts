/**
 * URL-based provider identification and model discovery.
 *
 * The user pastes an endpoint URL (e.g. https://openrouter.ai/api/v1).
 * identifyFromUrl() inspects the hostname and path to determine which
 * provider it is and how to authenticate. discoverModels() then calls
 * the /models endpoint to get the live model list.
 */

export interface UrlIdentity {
  provider: string;
  displayName: string;
  baseUrl: string;
  apiShape: 'openai' | 'anthropic';
  modelsUrl: string | null;
  modelFromPath?: string;
}

const OPERATION_SUFFIXES = [
  '/chat/completions',
  '/completions',
  '/models',
  '/messages',
];

/** Strip trailing slashes and known operation path suffixes so the user can
 *  paste a full URL (e.g. .../chat/completions) and still get the API root. */
function normalizeBase(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, '');
  for (const suffix of OPERATION_SUFFIXES) {
    if (url.endsWith(suffix)) {
      url = url.slice(0, url.length - suffix.length);
      break;
    }
  }
  return url;
}

function isPrivateIp(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/**
 * Identify the provider from a raw endpoint URL.
 * Returns a UrlIdentity describing the provider, normalized base URL,
 * API shape, and where to discover models.
 */
export function identifyFromUrl(rawUrl: string): UrlIdentity {
  const baseUrl = normalizeBase(rawUrl);

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // OpenRouter
  if (host === 'openrouter.ai') {
    return {
      provider: 'openrouter',
      displayName: 'OpenRouter',
      baseUrl,
      apiShape: 'openai',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // Z.ai
  if (host.endsWith('z.ai')) {
    const displayName = path.toLowerCase().includes('/coding/') ? 'Z.ai (Coding Plan)' : 'Z.ai';
    return {
      provider: 'zai',
      displayName,
      baseUrl,
      apiShape: 'openai',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // Groq
  if (host.endsWith('groq.com')) {
    return {
      provider: 'groq',
      displayName: 'Groq',
      baseUrl,
      apiShape: 'openai',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // OpenAI
  if (host === 'api.openai.com') {
    return {
      provider: 'openai',
      displayName: 'OpenAI',
      baseUrl,
      apiShape: 'openai',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // Anthropic
  if (host === 'api.anthropic.com') {
    return {
      provider: 'anthropic',
      displayName: 'Anthropic',
      baseUrl,
      apiShape: 'anthropic',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // Google Gemini
  if (host.endsWith('generativelanguage.googleapis.com')) {
    return {
      provider: 'gemini',
      displayName: 'Google Gemini',
      baseUrl,
      apiShape: 'openai',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // Cloudflare Workers AI -- model is embedded in the path after /ai/run/
  if (host.endsWith('api.cloudflare.com') && path.includes('/ai/run/')) {
    const aiRunStart = path.indexOf('/ai/run/') + '/ai/run/'.length;
    let modelFromPath = path.slice(aiRunStart);
    if (modelFromPath.startsWith('@cf/')) {
      modelFromPath = modelFromPath.slice('@cf/'.length);
    }
    // baseUrl is the account endpoint up to /ai/run (without the model)
    const cfBase = `${parsed.protocol}//${parsed.host}${path.slice(0, aiRunStart - 1)}`;
    return {
      provider: 'cloudflare',
      displayName: 'Cloudflare Workers AI',
      baseUrl: cfBase,
      apiShape: 'openai',
      modelsUrl: null,
      modelFromPath: modelFromPath || undefined,
    };
  }

  // Local / private LAN servers (Ollama, LM Studio, vLLM, etc.)
  if (isPrivateIp(host)) {
    return {
      provider: 'local',
      displayName: 'Local (OpenAI-compatible)',
      baseUrl,
      apiShape: 'openai',
      modelsUrl: `${baseUrl}/models`,
    };
  }

  // Unknown / custom endpoint -- assume OpenAI-compatible
  return {
    provider: 'custom',
    displayName: `Custom (${host})`,
    baseUrl,
    apiShape: 'openai',
    modelsUrl: `${baseUrl}/models`,
  };
}

/**
 * Discover the available models for a given endpoint.
 *
 * If the URL embeds the model (Cloudflare), returns that model directly.
 * If modelsUrl is null, returns an empty array.
 * Otherwise calls GET /models and maps the response to a list of id strings.
 *
 * Accepts an optional fetchFn for testability (defaults to globalThis.fetch).
 */
export async function discoverModels(
  identity: UrlIdentity,
  apiKey: string,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<string[]> {
  if (identity.modelFromPath) {
    return [identity.modelFromPath];
  }
  if (!identity.modelsUrl) {
    return [];
  }

  const headers: Record<string, string> =
    identity.apiShape === 'anthropic'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` };

  const res = await fetchFn(identity.modelsUrl, { headers });
  if (!res.ok) {
    throw new Error(
      `Provider identified as "${identity.displayName}" but GET /models returned HTTP ${res.status}. ` +
      `Enter the model ID manually.`,
    );
  }

  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => m.id).filter(Boolean);
}
