// EmbeddingProvider interface and factory, adapted from OpenClaw src/memory/embeddings.ts
// The original depended on OpenClawConfig, SecretInput, SSRF policies, model-auth, and
// per-provider client modules. This version keeps the same EmbeddingProvider interface
// but accepts simple options (apiKey, model, baseUrl) directly.

export type EmbeddingProvider = {
  id: string;
  model: string;
  maxInputTokens?: number;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};

export type EmbeddingProviderId = "openai" | "gemini" | "voyage" | "mistral" | "ollama";

function sanitizeErrorBody(body: string): string {
  const truncated = body.slice(0, 500);
  return truncated
    .replace(/(?:sk-|sk-ant-|key-|pa-|AIza|Bearer\s+)[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/[?&]key=[^&\s"']{10,}/g, "?key=[REDACTED]")
    .replace(/"(api_key|apiKey|secret|token|password)"\s*:\s*"[^"]{6,}"/gi, '"$1":"[REDACTED]"');
}

const APPROX_CHARS_PER_TOKEN = 4;

function validateInputLength(text: string, maxTokens?: number): void {
  if (maxTokens && text.length > maxTokens * APPROX_CHARS_PER_TOKEN) {
    throw new Error(
      `Input text (~${Math.ceil(text.length / APPROX_CHARS_PER_TOKEN)} tokens) exceeds provider limit of ${maxTokens} tokens`,
    );
  }
}

function sanitizeAndNormalizeEmbedding(vec: number[]): number[] {
  const sanitized = vec.map((value) => (Number.isFinite(value) ? value : 0));
  const magnitude = Math.sqrt(sanitized.reduce((sum, value) => sum + value * value, 0));
  if (magnitude < 1e-10) return sanitized;
  return sanitized.map((value) => value / magnitude);
}

// --- Shared helper for OpenAI-compatible providers (Bearer token + data[].embedding response) ---

interface BearerProviderConfig {
  id: EmbeddingProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxInputTokens?: number;
}

function createBearerEmbeddingProvider(config: BearerProviderConfig): EmbeddingProvider {
  const { id, apiKey, model, baseUrl, maxInputTokens } = config;

  async function call(input: string[]): Promise<number[][]> {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input, model }),
    });
    if (!res.ok) {
      throw new Error(`${id} embeddings failed (${res.status}): ${sanitizeErrorBody(await res.text())}`);
    }
    const body = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return body.data.map((d) => sanitizeAndNormalizeEmbedding(d.embedding));
  }

  return {
    id,
    model,
    maxInputTokens,
    embedQuery: async (text) => {
      validateInputLength(text, maxInputTokens);
      const results = await call([text]);
      if (!results || results.length === 0) {
        throw new Error(`${id} returned empty embedding response`);
      }
      return results[0];
    },
    embedBatch: async (texts) => {
      for (const t of texts) validateInputLength(t, maxInputTokens);
      return call(texts);
    },
  };
}

// --- OpenAI ---

const OPENAI_MAX_INPUT_TOKENS: Record<string, number> = {
  "text-embedding-3-small": 8192,
  "text-embedding-3-large": 8192,
  "text-embedding-ada-002": 8191,
};

function createOpenAiProvider(params: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): EmbeddingProvider {
  const model = params.model ?? "text-embedding-3-small";
  return createBearerEmbeddingProvider({
    id: "openai",
    apiKey: params.apiKey,
    model,
    baseUrl: (params.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    maxInputTokens: OPENAI_MAX_INPUT_TOKENS[model],
  });
}

// --- Gemini (different API shape — not Bearer-based) ---

const GEMINI_MAX_INPUT_TOKENS: Record<string, number> = {
  "gemini-embedding-001": 2048,
  "text-embedding-004": 2048,
};

function createGeminiProvider(params: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): EmbeddingProvider {
  const model = params.model ?? "gemini-embedding-001";
  const baseUrl = (params.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(
    /\/+$/,
    "",
  );

  async function call(texts: string[]): Promise<number[][]> {
    const requests = texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
    }));
    const res = await fetch(
      `${baseUrl}/models/${model}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": params.apiKey,
        },
        body: JSON.stringify({ requests }),
      },
    );
    if (!res.ok) throw new Error(`gemini embeddings failed (${res.status}): ${sanitizeErrorBody(await res.text())}`);
    const body = (await res.json()) as { embeddings: Array<{ values: number[] }> };
    return body.embeddings.map((e) => sanitizeAndNormalizeEmbedding(e.values));
  }

  const maxTokens = GEMINI_MAX_INPUT_TOKENS[model];

  return {
    id: "gemini",
    model,
    maxInputTokens: maxTokens,
    embedQuery: async (text) => {
      validateInputLength(text, maxTokens);
      const results = await call([text]);
      if (!results || results.length === 0) throw new Error("gemini returned empty embedding response");
      return results[0];
    },
    embedBatch: async (texts) => {
      for (const t of texts) validateInputLength(t, maxTokens);
      return call(texts);
    },
  };
}

// --- Voyage ---

function createVoyageProvider(params: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): EmbeddingProvider {
  return createBearerEmbeddingProvider({
    id: "voyage",
    apiKey: params.apiKey,
    model: params.model ?? "voyage-3-lite",
    baseUrl: (params.baseUrl ?? "https://api.voyageai.com/v1").replace(/\/+$/, ""),
  });
}

// --- Mistral ---

function createMistralProvider(params: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): EmbeddingProvider {
  return createBearerEmbeddingProvider({
    id: "mistral",
    apiKey: params.apiKey,
    model: params.model ?? "mistral-embed",
    baseUrl: (params.baseUrl ?? "https://api.mistral.ai/v1").replace(/\/+$/, ""),
  });
}

// --- Ollama (different API shape — no auth, different response) ---

function createOllamaProvider(params: {
  model?: string;
  baseUrl?: string;
}): EmbeddingProvider {
  const model = params.model ?? "nomic-embed-text";
  const baseUrl = (params.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");

  async function call(input: string[]): Promise<number[][]> {
    const res = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
    });
    if (!res.ok) throw new Error(`ollama embeddings failed (${res.status}): ${sanitizeErrorBody(await res.text())}`);
    const body = (await res.json()) as { embeddings: number[][] };
    return body.embeddings.map((v) => sanitizeAndNormalizeEmbedding(v));
  }

  return {
    id: "ollama",
    model,
    embedQuery: async (text) => {
      const results = await call([text]);
      if (!results || results.length === 0) throw new Error("ollama returned empty embedding response");
      return results[0];
    },
    embedBatch: call,
  };
}

// --- Factory ---
// Simplified from OpenClaw's createEmbeddingProvider which used OpenClawConfig,
// secret resolution, SSRF policies, and fallback chains.

export type CreateEmbeddingProviderOptions = {
  provider: EmbeddingProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export function createEmbeddingProvider(
  options: CreateEmbeddingProviderOptions,
): EmbeddingProvider {
  const { provider, apiKey, model, baseUrl } = options;

  switch (provider) {
    case "openai":
      if (!apiKey) throw new Error("OpenAI embedding provider requires an API key");
      return createOpenAiProvider({ apiKey, model, baseUrl });
    case "gemini":
      if (!apiKey) throw new Error("Gemini embedding provider requires an API key");
      return createGeminiProvider({ apiKey, model, baseUrl });
    case "voyage":
      if (!apiKey) throw new Error("Voyage embedding provider requires an API key");
      return createVoyageProvider({ apiKey, model, baseUrl });
    case "mistral":
      if (!apiKey) throw new Error("Mistral embedding provider requires an API key");
      return createMistralProvider({ apiKey, model, baseUrl });
    case "ollama":
      return createOllamaProvider({ model, baseUrl });
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}
