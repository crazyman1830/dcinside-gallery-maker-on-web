import {
  type GenerateContentResponse,
  type GoogleGenAI,
  type Schema,
  Type,
} from '@google/genai';
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
  const status = getErrorStatus(error);
  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
};

export const withProviderRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt === MAX_RETRIES) throw error;
      await new Promise(resolve => setTimeout(resolve, 1_000 * (2 ** attempt)));
    }
  }
  throw lastError;
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
  required: [
    'suggestedViews',
    'suggestedRecommendations',
    'suggestedNonRecommendations',
  ],
};

const commentArraySchema: Schema = {
  type: Type.ARRAY,
  items: commentSchema,
};

export interface GalleryStreamChunk {
  text: string;
  sources: Array<{ title?: string; uri?: string }>;
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

  const providerStream = await withProviderRetry(() => ai.models.generateContentStream({
    model,
    contents: prompt,
    config,
  }));

  async function* normalize(): AsyncGenerator<GalleryStreamChunk, void, unknown> {
    for await (const chunk of providerStream) {
      const sources = (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
        .flatMap(groundingChunk => groundingChunk.web ? [{
          title: groundingChunk.web.title,
          uri: groundingChunk.web.uri,
        }] : []);
      yield { text: chunk.text ?? '', sources };
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
): Promise<GeminiCommentContent[]> => withProviderRetry(async () => {
  const { prompt, numberOfCommentsToGenerate } = buildCommentGenerationPrompt(
    post,
    context,
    minComments,
    maxComments,
  );
  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: commentArraySchema,
      systemInstruction: buildSystemInstruction(context.topic, context),
      abortSignal: signal,
    },
  });
  return parseGeminiCommentArrayResponse(response.text ?? '')
    .slice(0, Math.min(numberOfCommentsToGenerate, maxComments));
});

export const generateFollowUpComments = async (
  ai: GoogleGenAI,
  post: Pick<Post, 'title' | 'author' | 'content'>,
  existingComments: Comment[],
  context: PromptContext,
  minComments: number,
  maxComments: number,
  model: string,
  signal?: AbortSignal,
): Promise<GeminiCommentContent[]> => withProviderRetry(async () => {
  const { prompt, numberOfCommentsToGenerate } = buildFollowUpCommentPrompt(
    post,
    existingComments,
    context,
    minComments,
    maxComments,
  );
  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: commentArraySchema,
      systemInstruction: buildSystemInstruction(context.topic, context),
      abortSignal: signal,
    },
  });
  return parseGeminiCommentArrayResponse(response.text ?? '')
    .slice(0, Math.min(numberOfCommentsToGenerate, maxComments));
});

export const evaluatePost = async (
  ai: GoogleGenAI,
  post: Pick<Post, 'title' | 'author' | 'content'>,
  context: PromptContext,
  model: string,
  signal?: AbortSignal,
): Promise<GeminiEvaluationResponse> => withProviderRetry(async () => {
  const { prompt } = buildPostEvaluationPrompt(post, context);
  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: evaluationSchema,
      systemInstruction: buildSystemInstruction(context.topic, context),
      abortSignal: signal,
    },
  });
  return parseGeminiEvaluationResponse(response.text ?? '');
});

export const generateFeedback = async (
  ai: GoogleGenAI,
  customWorldviewText: string,
  galleryData: GalleryData,
  model: string,
  signal?: AbortSignal,
): Promise<string> => withProviderRetry(async () => {
  const { prompt } = buildWorldviewFeedbackPrompt(customWorldviewText, galleryData);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { abortSignal: signal },
  });
  return response.text || '피드백을 생성할 수 없습니다.';
});
