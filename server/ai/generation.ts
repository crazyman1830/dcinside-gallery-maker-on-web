import { type GenerateContentResponse, type GoogleGenAI, type Schema, Type } from '@google/genai';
import type {
  Comment,
  GalleryData,
  GeminiCommentContent,
  GeminiEvaluationResponse,
  Post,
} from '../../types';
import {
  buildCommentGenerationPrompt,
  buildFollowUpCommentPrompt,
} from '../../services/prompts/comments';
import {
  buildPostEvaluationPrompt,
  buildWorldviewFeedbackPrompt,
} from '../../services/prompts/evaluation';
import { buildGalleryGenerationPrompt } from '../../services/prompts/gallery';
import { buildSystemInstruction } from '../../services/prompts/system';
import type { PromptContext } from '../../services/prompts/context';
import {
  parseGeminiCommentArrayResponse,
  parseGeminiEvaluationResponse,
} from '../../utils/jsonParser';

const MAX_RETRIES = 2;
const MAX_FORMAT_REPAIRS = 1;
export const MAX_CONCURRENT_PROVIDER_RPCS = 4;
export const MAX_GALLERY_OUTPUT_TOKENS = 8_192;
export const MAX_COMMENT_OUTPUT_TOKENS = 4_096;
export const MAX_EVALUATION_OUTPUT_TOKENS = 256;
export const MAX_FEEDBACK_OUTPUT_TOKENS = 1_024;

export class MalformedAiResponseError extends Error {
  readonly status = 502;
  readonly code = 'MALFORMED_AI_RESPONSE';
  readonly retryable = true;

  constructor(readonly cause: unknown) {
    super('AI가 올바른 데이터 형식으로 응답하지 않았습니다.');
    this.name = 'MalformedAiResponseError';
  }
}

export class ProviderRpcCapacityError extends Error {
  readonly status = 503;
  readonly code = 'AI_PROVIDER_CAPACITY';
  readonly retryable = true;

  constructor() {
    super('진행 중인 AI 공급자 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    this.name = 'ProviderRpcCapacityError';
  }
}

export class ProviderRpcLimiter {
  private active = 0;

  constructor(readonly maxConcurrent = MAX_CONCURRENT_PROVIDER_RPCS) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new TypeError('maxConcurrent must be a positive integer.');
    }
  }

  get activeCount(): number {
    return this.active;
  }

  acquire(): () => void {
    if (this.active >= this.maxConcurrent) throw new ProviderRpcCapacityError();
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = this.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export const providerRpcLimiter = new ProviderRpcLimiter();

type ErrorWithStatus = Error & {
  status?: number;
  statusCode?: number;
  code?: number | string;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) return undefined;
  const candidate = error as ErrorWithStatus;
  const rawStatus = candidate.status ?? candidate.statusCode ?? candidate.code;
  if (typeof rawStatus === 'number') return rawStatus;
  if (typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus)) return Number(rawStatus);
  const match = error.message.match(/(?:HTTP|status(?: code)?)\s*[:=]?\s*(\d{3})/i);
  return match ? Number(match[1]) : undefined;
};

export const isRetryableProviderError = (error: unknown): boolean => {
  // Local capacity must be returned to the caller immediately. Retrying inside
  // this process cannot create a free provider slot and only amplifies load.
  if (error instanceof ProviderRpcCapacityError) return false;
  const status = getErrorStatus(error);
  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
};

interface ProviderRetryOptions {
  signal?: AbortSignal;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  limitConcurrency?: boolean;
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
};

const retryAfterMilliseconds = (error: unknown): number | undefined => {
  const candidate = error as {
    retryAfter?: unknown;
    response?: { headers?: { get?: (name: string) => string | null } };
  };
  const raw = candidate?.retryAfter ?? candidate?.response?.headers?.get?.('retry-after');
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw * 1_000);
  if (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim())) {
    return Math.max(0, Number(raw) * 1_000);
  }
  return undefined;
};

const abortableDelay = (delayMs: number, signal?: AbortSignal): Promise<void> => {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    timer.unref?.();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The request was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

export const withProviderRetry = async <T>(
  operation: () => Promise<T>,
  { signal, onRetry, limitConcurrency = true }: ProviderRetryOptions = {},
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await (limitConcurrency ? providerRpcLimiter.run(operation) : operation());
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt === MAX_RETRIES) throw error;
      throwIfAborted(signal);
      const exponentialCap = 1_000 * 2 ** attempt;
      const providerDelay = retryAfterMilliseconds(error);
      const delayMs = Math.min(10_000, providerDelay ?? Math.floor(Math.random() * exponentialCap));
      onRetry?.(attempt + 1, delayMs, error);
      await abortableDelay(delayMs, signal);
    }
  }
  throw lastError;
};

const withFormatRepair = async <T>(
  operation: (repair: boolean) => Promise<string>,
  parse: (text: string) => T,
  signal?: AbortSignal,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_FORMAT_REPAIRS; attempt += 1) {
    throwIfAborted(signal);
    const text = await operation(attempt > 0);
    try {
      return parse(text);
    } catch (error) {
      throwIfAborted(signal);
      lastError = error;
      if (attempt === MAX_FORMAT_REPAIRS) break;
    }
  }
  throw new MalformedAiResponseError(lastError);
};

export const repairGalleryGeneration = async (
  ai: GoogleGenAI,
  context: PromptContext,
  model: string,
  signal?: AbortSignal,
): Promise<string> => {
  const { prompt } = buildGalleryGenerationPrompt(context);
  const response = await withProviderRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: `${prompt}\n\nFORMAT REPAIR: The previous response was malformed. Return valid JSON only. Do not include prose or Markdown fences.`,
        config: {
          systemInstruction: buildSystemInstruction(context.topic, context),
          responseMimeType: 'application/json',
          responseSchema: galleryResponseSchema,
          maxOutputTokens: MAX_GALLERY_OUTPUT_TOKENS,
          abortSignal: signal,
        },
      }),
    { signal },
  );
  return response.text ?? '';
};

const commentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    author: { type: Type.STRING, description: 'The nickname of the commenter.' },
    text: { type: Type.STRING, description: 'The content of the comment.' },
    recommendations: { type: Type.INTEGER },
    nonRecommendations: { type: Type.INTEGER },
  },
  required: ['author', 'text', 'recommendations', 'nonRecommendations'],
};

const galleryResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    galleryTitle: { type: Type.STRING },
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          author: { type: Type.STRING },
          content: { type: Type.STRING },
        },
        required: ['title', 'author', 'content'],
      },
    },
  },
  required: ['galleryTitle', 'posts'],
};

const evaluationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    suggestedViews: { type: Type.INTEGER },
    suggestedRecommendations: { type: Type.INTEGER },
    suggestedNonRecommendations: { type: Type.INTEGER },
  },
  required: ['suggestedViews', 'suggestedRecommendations', 'suggestedNonRecommendations'],
};

const commentArraySchema: Schema = {
  type: Type.ARRAY,
  items: commentSchema,
};

export interface GalleryStreamChunk {
  text: string;
  sources: Array<{ title?: string; uri?: string }>;
  /** Whether this chunk proves that Google Search grounding ran. */
  hasSearchMetadata: boolean;
  /** Unmodified provider markup; validated by the gallery engine. */
  searchEntryPointRenderedContent?: unknown;
}

export const streamGalleryGeneration = async (
  ai: GoogleGenAI,
  context: PromptContext,
  model: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<GalleryStreamChunk, void, unknown>> => {
  const { prompt } = buildGalleryGenerationPrompt(context);
  const config = context.useSearch
    ? {
        systemInstruction: buildSystemInstruction(context.topic, context),
        tools: [{ googleSearch: {} }],
        abortSignal: signal,
      }
    : {
        systemInstruction: buildSystemInstruction(context.topic, context),
        responseMimeType: 'application/json',
        responseSchema: galleryResponseSchema,
        abortSignal: signal,
      };

  async function* normalize(): AsyncGenerator<GalleryStreamChunk, void, unknown> {
    // Retry is safe only before the first provider chunk is exposed. Once data
    // has been streamed to the caller, replaying would duplicate content.
    const { iterator, first, release } = await withProviderRetry(
      async () => {
        const release = providerRpcLimiter.acquire();
        try {
          const providerStream = await ai.models.generateContentStream({
            model,
            contents: prompt,
            config: { ...config, maxOutputTokens: MAX_GALLERY_OUTPUT_TOKENS },
          });
          const streamIterator = providerStream[Symbol.asyncIterator]();
          const firstChunk = await streamIterator.next();
          return { iterator: streamIterator, first: firstChunk, release };
        } catch (error) {
          release();
          throw error;
        }
      },
      { signal, limitConcurrency: false },
    );

    try {
      let next = first;
      while (!next.done) {
        const chunk = next.value;
        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
        const rawGroundingChunks = groundingMetadata?.groundingChunks;
        const groundingChunks: unknown[] = Array.isArray(rawGroundingChunks)
          ? rawGroundingChunks
          : [];
        const sources = groundingChunks.flatMap(groundingChunk => {
          const web = (groundingChunk as { web?: unknown } | null)?.web;
          if (web === undefined) return [];
          const candidate = web as { title?: unknown; uri?: unknown };
          return [
            {
              ...(typeof candidate?.title === 'string' ? { title: candidate.title } : {}),
              ...(typeof candidate?.uri === 'string' ? { uri: candidate.uri } : {}),
            },
          ];
        });
        const rawMetadata = groundingMetadata as
          | {
              searchEntryPoint?: unknown;
              webSearchQueries?: unknown;
            }
          | undefined;
        const searchEntryPoint = rawMetadata?.searchEntryPoint as
          { renderedContent?: unknown } | undefined;
        const hasWebGroundingChunk = groundingChunks.some(
          groundingChunk => (groundingChunk as { web?: unknown } | null)?.web !== undefined,
        );
        const hasWebSearchQueries = rawMetadata?.webSearchQueries !== undefined;
        const hasSearchEntryPoint = rawMetadata?.searchEntryPoint !== undefined;
        yield {
          text: chunk.text ?? '',
          sources,
          hasSearchMetadata: hasWebGroundingChunk || hasWebSearchQueries || hasSearchEntryPoint,
          ...(hasSearchEntryPoint
            ? { searchEntryPointRenderedContent: searchEntryPoint?.renderedContent }
            : {}),
        };
        next = await iterator.next();
      }
    } finally {
      try {
        await iterator.return?.(undefined);
      } catch {
        // Cleanup failures must not hide the generation result or original error.
      } finally {
        release();
      }
    }
  }

  return normalize();
};

export const generateComments = async (
  ai: GoogleGenAI,
  post: Pick<Post, 'title' | 'author' | 'content'>,
  context: PromptContext,
  minComments: number,
  maxComments: number,
  model: string,
  signal?: AbortSignal,
): Promise<GeminiCommentContent[]> => {
  const { prompt, numberOfCommentsToGenerate } = buildCommentGenerationPrompt(
    post,
    context,
    minComments,
    maxComments,
  );
  return withFormatRepair(
    async repair => {
      const response: GenerateContentResponse = await withProviderRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: repair
              ? `${prompt}\n\nFORMAT REPAIR: Return valid JSON only. Do not include prose or Markdown fences.`
              : prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: commentArraySchema,
              systemInstruction: buildSystemInstruction(context.topic, context),
              maxOutputTokens: MAX_COMMENT_OUTPUT_TOKENS,
              abortSignal: signal,
            },
          }),
        { signal },
      );
      return response.text ?? '';
    },
    text =>
      parseGeminiCommentArrayResponse(text).slice(
        0,
        Math.min(numberOfCommentsToGenerate, maxComments),
      ),
    signal,
  );
};

export const generateFollowUpComments = async (
  ai: GoogleGenAI,
  post: Pick<Post, 'title' | 'author' | 'content'>,
  existingComments: Comment[],
  context: PromptContext,
  minComments: number,
  maxComments: number,
  model: string,
  signal?: AbortSignal,
): Promise<GeminiCommentContent[]> => {
  const { prompt, numberOfCommentsToGenerate } = buildFollowUpCommentPrompt(
    post,
    existingComments,
    context,
    minComments,
    maxComments,
  );
  return withFormatRepair(
    async repair => {
      const response: GenerateContentResponse = await withProviderRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: repair
              ? `${prompt}\n\nFORMAT REPAIR: Return valid JSON only. Do not include prose or Markdown fences.`
              : prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: commentArraySchema,
              systemInstruction: buildSystemInstruction(context.topic, context),
              maxOutputTokens: MAX_COMMENT_OUTPUT_TOKENS,
              abortSignal: signal,
            },
          }),
        { signal },
      );
      return response.text ?? '';
    },
    text =>
      parseGeminiCommentArrayResponse(text).slice(
        0,
        Math.min(numberOfCommentsToGenerate, maxComments),
      ),
    signal,
  );
};

export const evaluatePost = async (
  ai: GoogleGenAI,
  post: Pick<Post, 'title' | 'author' | 'content'>,
  context: PromptContext,
  model: string,
  signal?: AbortSignal,
): Promise<GeminiEvaluationResponse> => {
  const { prompt } = buildPostEvaluationPrompt(post, context);
  return withFormatRepair(
    async repair => {
      const response: GenerateContentResponse = await withProviderRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: repair
              ? `${prompt}\n\nFORMAT REPAIR: Return valid JSON only. Do not include prose or Markdown fences.`
              : prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: evaluationSchema,
              systemInstruction: buildSystemInstruction(context.topic, context),
              maxOutputTokens: MAX_EVALUATION_OUTPUT_TOKENS,
              abortSignal: signal,
            },
          }),
        { signal },
      );
      return response.text ?? '';
    },
    parseGeminiEvaluationResponse,
    signal,
  );
};

export const generateFeedback = async (
  ai: GoogleGenAI,
  customWorldviewText: string,
  galleryData: GalleryData,
  model: string,
  signal?: AbortSignal,
): Promise<string> =>
  withProviderRetry(
    async () => {
      const { prompt } = buildWorldviewFeedbackPrompt(customWorldviewText, galleryData);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { abortSignal: signal, maxOutputTokens: MAX_FEEDBACK_OUTPUT_TOKENS },
      });
      return response.text || '피드백을 생성할 수 없습니다.';
    },
    { signal },
  );
