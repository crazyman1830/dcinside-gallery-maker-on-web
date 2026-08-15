import type {
  AiProvider,
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  GalleryData,
  GalleryContextParams,
  GalleryStreamEvent,
  GenerationWarning,
  FollowUpPostContext,
  NewPostData,
  Post,
  WorldviewFeedbackGallerySample,
} from '../types';
import { z } from 'zod';
import {
  commentSchema,
  generationWarningSchema,
  initialGalleryDataSchema,
  MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES,
  postSchema,
} from '../schemas';
import { ApiError, readApiError } from './apiError';
export type {
  CreateGalleryParams,
  GalleryContextParams,
  GalleryStreamEvent,
  NewPostData,
} from '../types';

export const NDJSON_MAX_LINE_BYTES = 512 * 1024;
export const NDJSON_MAX_TOTAL_BYTES = 1024 * 1024;
export const GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES = MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES;

const addUserPostResponseSchema = z
  .object({
    post: postSchema,
    warnings: z.array(generationWarningSchema).max(100),
  })
  .strict();
const followUpCommentsResponseSchema = z.array(commentSchema).max(30);
const worldviewFeedbackResponseSchema = z.object({ feedback: z.string() }).strict();

const galleryStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chunk'), text: z.string() }).strict(),
  z
    .object({
      type: z.literal('phase'),
      phase: z.enum(['gallery', 'posts', 'complete']),
      message: z.string().trim().min(1).max(500),
      progress: z.number().int().min(0).max(100),
    })
    .strict(),
  z.object({ type: z.literal('warning'), warning: generationWarningSchema }).strict(),
  z.object({ type: z.literal('result'), data: initialGalleryDataSchema }).strict(),
  z
    .object({
      type: z.literal('error'),
      message: z.string().trim().min(1),
      code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
      retryable: z.boolean(),
      requestId: z.string().trim().min(1),
      retryAfterSeconds: z.number().int().min(0).max(60).optional(),
    })
    .strict(),
]);

const generationWarningKey = (warning: GenerationWarning): string =>
  [warning.code, warning.stage ?? '', warning.postId ?? '', warning.message].join('\u0000');

const parseGalleryStreamEvent = (value: unknown): GalleryStreamEvent => {
  const parsed = galleryStreamEventSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('로컬 AI 서버가 올바르지 않은 스트림 이벤트를 반환했습니다.');
  }
  return parsed.data;
};

const invalidApiResponse = (): ApiError =>
  new ApiError('로컬 AI 서버 응답 형식이 올바르지 않습니다.', {
    status: 502,
    code: 'INVALID_API_RESPONSE',
    retryable: false,
  });

const postJson = async <T>(
  path: string,
  body: unknown,
  responseSchema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await readApiError(response, '요청에 실패했습니다.');
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw invalidApiResponse();
  }
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw invalidApiResponse();
  return parsed.data;
};

export const parseNdjsonStream = async (
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: GalleryStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let totalBytes = 0;

  const abortError = (): Error => {
    if (signal?.reason instanceof Error) return signal.reason;
    return new DOMException('The request was aborted.', 'AbortError');
  };
  const throwIfAborted = (): void => {
    if (signal?.aborted) throw abortError();
  };
  const cancelReader = (): void => {
    void reader.cancel(abortError()).catch(() => undefined);
  };

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    if (encoder.encode(line).byteLength > NDJSON_MAX_LINE_BYTES) {
      throw new Error('로컬 AI 서버의 스트림 한 줄 크기가 제한을 초과했습니다.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw new Error('로컬 AI 서버가 올바르지 않은 스트림 데이터를 반환했습니다.');
    }
    onEvent(parseGalleryStreamEvent(parsed));
  };

  try {
    throwIfAborted();
    signal?.addEventListener('abort', cancelReader, { once: true });
    while (true) {
      const { value, done } = await reader.read();
      throwIfAborted();
      totalBytes += value?.byteLength ?? 0;
      if (totalBytes > NDJSON_MAX_TOTAL_BYTES) {
        throw new Error('로컬 AI 서버의 스트림 전체 크기가 제한을 초과했습니다.');
      }
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
      if (encoder.encode(buffer).byteLength > NDJSON_MAX_LINE_BYTES) {
        throw new Error('로컬 AI 서버의 스트림 한 줄 크기가 제한을 초과했습니다.');
      }
      if (done) break;
    }
    consumeLine(buffer);
  } catch (error) {
    if (!signal?.aborted) await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
};

/** Serialize only fields in the provider-facing request contract. */
const toAiRequestContext = (galleryContext: CreateGalleryParams): CreateGalleryParams => ({
  topic: galleryContext.topic,
  discussionContext: galleryContext.discussionContext,
  worldviewValue: galleryContext.worldviewValue,
  customWorldviewText: galleryContext.customWorldviewText,
  worldviewEraValue: galleryContext.worldviewEraValue,
  toxicityLevelValue: galleryContext.toxicityLevelValue,
  anonymousNickRatioValue: galleryContext.anonymousNickRatioValue,
  userSpecies: galleryContext.userSpecies,
  userAffiliation: galleryContext.userAffiliation,
  genderRatioValue: galleryContext.genderRatioValue,
  ageRangeValue: galleryContext.ageRangeValue,
  selectedProvider: galleryContext.selectedProvider,
  selectedModel: galleryContext.selectedModel,
  useSearch: galleryContext.useSearch,
  userProfile: galleryContext.userProfile,
});

export const createGalleryStreamed = async (
  params: CreateGalleryParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onPhase?: (phase: string, message?: string, progress?: number) => void,
): Promise<GalleryData> => {
  const response = await fetch('/api/ai/gallery/stream', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify(toAiRequestContext(params)),
    signal,
  });

  if (!response.ok) throw await readApiError(response, '요청에 실패했습니다.');
  if (!response.body) throw new Error('로컬 AI 서버의 스트림을 열 수 없습니다.');

  let result: GalleryData | undefined;
  let streamError: Error | undefined;
  const warnings: GenerationWarning[] = [];
  await parseNdjsonStream(
    response.body,
    event => {
      if (event.type === 'chunk') onChunk(event.text);
      if (event.type === 'phase') onPhase?.(event.phase, event.message, event.progress);
      if (event.type === 'warning') warnings.push(event.warning);
      if (event.type === 'result') result = event.data;
      if (event.type === 'error') {
        streamError = new ApiError(event.message, {
          code: event.code,
          retryable: event.retryable,
          requestId: event.requestId,
          retryAfterSeconds: event.retryAfterSeconds,
        });
      }
    },
    signal,
  );

  if (streamError) throw streamError;
  if (!result) throw new Error('갤러리 생성 결과가 완료되기 전에 연결이 종료되었습니다.');
  if (warnings.length === 0) return result;

  const mergedWarnings = [...(result.warnings ?? [])];
  const warningKeys = new Set(mergedWarnings.map(generationWarningKey));
  warnings.forEach(warning => {
    const key = generationWarningKey(warning);
    if (!warningKeys.has(key)) {
      warningKeys.add(key);
      mergedWarnings.push(warning);
    }
  });
  return { ...result, warnings: mergedWarnings };
};

export const addUserPost = async (
  newPostData: NewPostData,
  galleryContext: GalleryContextParams,
  selectedModel: string,
  signal?: AbortSignal,
): Promise<AddUserPostResponse> =>
  postJson<AddUserPostResponse>(
    '/api/ai/posts',
    {
      newPostData,
      galleryContext: { ...toAiRequestContext(galleryContext), selectedModel },
    },
    addUserPostResponseSchema,
    signal,
  );

export const addFollowUpComments = async (
  targetPost: Post,
  updatedComments: Comment[],
  galleryContext: GalleryContextParams,
  selectedModel: string,
  signal?: AbortSignal,
): Promise<Comment[]> =>
  postJson<Comment[]>(
    '/api/ai/comments/follow-up',
    {
      targetPost: {
        id: targetPost.id,
        title: targetPost.title,
        author: targetPost.author,
        content: targetPost.content,
      } satisfies FollowUpPostContext,
      recentComments: updatedComments.slice(-6),
      totalCommentCount: updatedComments.length,
      galleryContext: { ...toAiRequestContext(galleryContext), selectedModel },
    },
    followUpCommentsResponseSchema,
    signal,
  );

const truncateForFeedback = (value: string, maximum: number): string =>
  value.length <= maximum ? value : value.slice(0, maximum);

export const buildWorldviewFeedbackGallerySample = (
  galleryData: GalleryData,
): WorldviewFeedbackGallerySample => ({
  galleryTitle: galleryData.galleryTitle,
  posts: galleryData.posts.slice(0, 5).map(post => ({
    title: post.title,
    content: truncateForFeedback(post.content, 1_200),
    comments: post.comments.slice(-3).map(comment => ({
      author: comment.author,
      text: truncateForFeedback(comment.text, 500),
    })),
  })),
});

export const getWorldviewFeedback = async (
  customWorldviewText: string,
  galleryData: GalleryData,
  selectedModel: string,
  selectedProvider: AiProvider | undefined,
  signal?: AbortSignal,
): Promise<string> => {
  const payload = await postJson<{ feedback: string }>(
    '/api/ai/worldview-feedback',
    {
      customWorldviewText,
      gallerySample: buildWorldviewFeedbackGallerySample(galleryData),
      selectedModel,
      selectedProvider,
    },
    worldviewFeedbackResponseSchema,
    signal,
  );
  return payload.feedback;
};
