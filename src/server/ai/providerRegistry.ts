import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface ProviderCapabilities {
  id: string;
  name: string;
  model: string;
  modelVersion: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  supportsEmbeddings: boolean;
  supportsToolCalling: boolean;
  contextWindow: number;
  supportedImageFormats: string[];
  configured: boolean;
  isDemoFallback: boolean;
}

export interface GenerateVisionJsonParams {
  model?: string;
  systemInstruction: string;
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface GenerateTextStreamParams {
  model?: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export function getRegisteredProviders(): ProviderCapabilities[] {
  const geminiConfigured = getGeminiClient() !== null;
  return [
    {
      id: 'gemini',
      name: 'Google Gemini',
      model: process.env.AI_MODEL || 'gemini-4-hydrogen',
      modelVersion: '4.0-hydrogen',
      supportsVision: true,
      supportsStreaming: true,
      supportsStructuredOutput: true,
      supportsEmbeddings: true,
      supportsToolCalling: true,
      contextWindow: 1000000,
      supportedImageFormats: ['image/png', 'image/jpeg', 'image/webp'],
      configured: geminiConfigured,
      isDemoFallback: false,
    },
    {
      id: 'mock_fixture',
      name: 'Deterministic Dev Fixture Provider',
      model: 'deterministic-fixture-v1',
      modelVersion: '1.0',
      supportsVision: true,
      supportsStreaming: true,
      supportsStructuredOutput: true,
      supportsEmbeddings: false,
      supportsToolCalling: false,
      contextWindow: 32000,
      supportedImageFormats: ['image/png', 'image/jpeg', 'image/webp'],
      configured: true,
      isDemoFallback: true,
    },
  ];
}

// Retry transient 503/429 capacity spikes on the configured Gemini 4 model without switching to unsupported model IDs.

export interface NormalizedProviderError {
  message: string;
  statusCode: number;
  retryable: boolean;
}

export function normalizeProviderError(error: unknown): NormalizedProviderError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();

  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      message:
        'The AI model is temporarily experiencing high demand (503). Please retry in a few seconds, or enable Fixture Mode for offline deterministic testing.',
      statusCode: 503,
      retryable: true,
    };
  }

  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      message:
        'AI provider rate limit reached temporarily (429). Please wait a moment and retry, or switch to Fixture Mode.',
      statusCode: 429,
      retryable: true,
    };
  }

  if (lower.includes('api key') || lower.includes('unauthenticated') || lower.includes('401')) {
    return {
      message: 'AI provider authentication is unavailable. Please verify server credentials.',
      statusCode: 502,
      retryable: false,
    };
  }

  // Strip raw JSON payloads if an SDK error serialized a nested JSON object
  const clean = raw.trim().startsWith('{')
    ? 'The AI provider returned an unexpected upstream error. Please retry shortly.'
    : raw.slice(0, 260) || 'AI request failed. Please retry shortly.';

  return {
    message: clean,
    statusCode: 502,
    retryable: false,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateGeminiJson(
  params: GenerateVisionJsonParams
): Promise<{ text: string; tokensUsed: number; model: string }> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const primaryModel = params.model || process.env.AI_MODEL || 'gemini-4-hydrogen';
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }
  parts.push({ text: params.prompt });

  const candidates = [primaryModel, primaryModel];

  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const isGemini4 = model.includes('gemini-4');
    try {
      const response = await client.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          ...(isGemini4 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });

      const text = (response.text ?? '{}').trim();
      const tokensUsed =
        response.usageMetadata?.totalTokenCount ??
        Math.ceil((params.prompt.length + text.length) / 4);

      return { text, tokensUsed, model };
    } catch (error) {
      lastError = error;
      const norm = normalizeProviderError(error);
      if (!norm.retryable || i === candidates.length - 1) {
        const cleanErr = new Error(norm.message) as Error & { statusCode?: number };
        cleanErr.statusCode = norm.statusCode;
        throw cleanErr;
      }
      await sleep(500 * (i + 1));
    }
  }

  const norm = normalizeProviderError(lastError);
  const cleanErr = new Error(norm.message) as Error & { statusCode?: number };
  cleanErr.statusCode = norm.statusCode;
  throw cleanErr;
}

export async function* streamGeminiChat(
  params: GenerateTextStreamParams
): AsyncGenerator<string, { tokensUsed: number; model: string }> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const primaryModel = params.model || process.env.AI_MODEL || 'gemini-4-hydrogen';
  const contents = [
    ...params.history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: params.message }],
    },
  ];

  const candidates = [primaryModel, primaryModel];

  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const isGemini4 = model.includes('gemini-4');
    let yieldedAny = false;
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: params.systemInstruction,
          ...(isGemini4 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });

      let totalChars = params.message.length;
      for await (const chunk of stream) {
        const piece = chunk.text ?? '';
        if (piece) {
          yieldedAny = true;
          totalChars += piece.length;
          yield piece;
        }
      }

      return {
        tokensUsed: Math.ceil(totalChars / 4),
        model,
      };
    } catch (error) {
      lastError = error;
      const norm = normalizeProviderError(error);
      if (yieldedAny || !norm.retryable || i === candidates.length - 1) {
        const cleanErr = new Error(norm.message) as Error & { statusCode?: number };
        cleanErr.statusCode = norm.statusCode;
        throw cleanErr;
      }
      await sleep(500 * (i + 1));
    }
  }

  const norm = normalizeProviderError(lastError);
  const cleanErr = new Error(norm.message) as Error & { statusCode?: number };
  cleanErr.statusCode = norm.statusCode;
  throw cleanErr;
}

export async function embedTextsWithGemini(texts: string[]): Promise<number[][]> {
  const client = getGeminiClient();
  if (!client || texts.length === 0) {
    return texts.map(() => []);
  }

  const embeddingModel = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';
  const vectors: number[][] = [];

  for (const text of texts) {
    try {
      const result = await client.models.embedContent({
        model: embeddingModel,
        contents: text.slice(0, 6000),
      });
      const values = result.embeddings?.[0]?.values ?? [];
      vectors.push(Array.from(values));
    } catch (error) {
      console.error('Embedding generation failed for chunk:', error);
      vectors.push([]);
    }
  }

  return vectors;
}
