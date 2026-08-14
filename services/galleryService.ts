import type {
  AiProvider,
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  GalleryData,
  GalleryContextParams,
  GalleryStreamEvent,
  GenerationWarning,
  NewPostData,
  Post,
} from '../types';
export type {
  CreateGalleryParams,
  GalleryContextParams,
  GalleryStreamEvent,
  NewPostData,
} from '../types';

export const NDJSON_MAX_LINE_BYTES = 512 * 1024;
export const NDJSON_MAX_TOTAL_BYTES = 1024 * 1024;
export const GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES = 64 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOptionalString = (value: Record<string, unknown>, key: string): boolean =>
  value[key] === undefined || typeof value[key] === 'string';

const GENERATION_WARNING_STAGES = new Set(['evaluation', 'comments', 'grounding', 'storage']);

const isComment = (value: unknown): value is Comment => {
  if (!isRecord(value)) return false;
  return (
    ['id', 'author', 'text', 'timestamp'].every(key => typeof value[key] === 'string') &&
    typeof value.recommendations === 'number' &&
    Number.isFinite(value.recommendations) &&
    typeof value.nonRecommendations === 'number' &&
    Number.isFinite(value.nonRecommendations) &&
    (value.voted === undefined ||
      value.voted === null ||
      value.voted === 'rec' ||
      value.voted === 'nonrec') &&
    (value.replyTo === undefined ||
      (isRecord(value.replyTo) &&
        typeof value.replyTo.commentId === 'string' &&
        typeof value.replyTo.author === 'string'))
  );
};

const isPost = (value: unknown): value is Post => {
  if (!isRecord(value)) return false;
  return (
    ['id', 'title', 'author', 'timestamp', 'content'].every(
      key => typeof value[key] === 'string',
    ) &&
    ['views', 'recommendations', 'nonRecommendations'].every(
      key => typeof value[key] === 'number' && Number.isFinite(value[key]),
    ) &&
    Array.isArray(value.comments) &&
    value.comments.every(isComment) &&
    (value.isBestPost === undefined || typeof value.isBestPost === 'boolean') &&
    (value.voted === undefined ||
      value.voted === null ||
      value.voted === 'rec' ||
      value.voted === 'nonrec')
  );
};

const isGenerationWarning = (value: unknown): value is GenerationWarning =>
  isRecord(value) &&
  typeof value.code === 'string' &&
  typeof value.message === 'string' &&
  (value.stage === undefined ||
    (typeof value.stage === 'string' && GENERATION_WARNING_STAGES.has(value.stage))) &&
  hasOptionalString(value, 'postId');

const generationWarningKey = (warning: GenerationWarning): string =>
  [warning.code, warning.stage ?? '', warning.postId ?? '', warning.message].join('\u0000');

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const isGalleryData = (value: unknown): value is GalleryData => {
  if (!isRecord(value) || typeof value.galleryTitle !== 'string' || !Array.isArray(value.posts))
    return false;
  if (!value.posts.every(isPost)) return false;
  if (
    value.sources !== undefined &&
    (!Array.isArray(value.sources) ||
      !value.sources.every(
        source =>
          isRecord(source) &&
          hasOptionalString(source, 'title') &&
          hasOptionalString(source, 'uri'),
      ))
  )
    return false;
  if (
    value.searchEntryPoint !== undefined &&
    (!isRecord(value.searchEntryPoint) ||
      Object.keys(value.searchEntryPoint).some(key => key !== 'renderedContent') ||
      typeof value.searchEntryPoint.renderedContent !== 'string' ||
      value.searchEntryPoint.renderedContent.length === 0 ||
      utf8ByteLength(value.searchEntryPoint.renderedContent) >
        GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES)
  )
    return false;
  return (
    value.warnings === undefined ||
    (Array.isArray(value.warnings) && value.warnings.every(isGenerationWarning))
  );
};

const parseGalleryStreamEvent = (value: unknown): GalleryStreamEvent => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('로컬 AI 서버가 올바르지 않은 스트림 이벤트를 반환했습니다.');
  }
  switch (value.type) {
    case 'chunk':
      if (typeof value.text === 'string') return { type: 'chunk', text: value.text };
      break;
    case 'phase':
      if (
        typeof value.phase === 'string' &&
        hasOptionalString(value, 'message') &&
        (value.progress === undefined ||
          (typeof value.progress === 'number' && Number.isFinite(value.progress)))
      ) {
        return {
          type: 'phase',
          phase: value.phase,
          ...(typeof value.message === 'string' ? { message: value.message } : {}),
          ...(typeof value.progress === 'number' ? { progress: value.progress } : {}),
        };
      }
      break;
    case 'warning':
      if (isGenerationWarning(value.warning)) return { type: 'warning', warning: value.warning };
      break;
    case 'result':
      if (isGalleryData(value.data)) return { type: 'result', data: value.data };
      break;
    case 'error':
      if (
        typeof value.message === 'string' &&
        hasOptionalString(value, 'code') &&
        hasOptionalString(value, 'requestId') &&
        (value.retryable === undefined || typeof value.retryable === 'boolean')
      ) {
        return {
          type: 'error',
          message: value.message,
          ...(typeof value.code === 'string' ? { code: value.code } : {}),
          ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
          ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
        };
      }
      break;
    default:
      break;
  }
  throw new Error('로컬 AI 서버가 올바르지 않은 스트림 이벤트를 반환했습니다.');
};

const readError = async (response: Response): Promise<Error> => {
  let message = `요청에 실패했습니다. (HTTP ${response.status})`;
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    message = payload.error || payload.message || message;
  } catch {
    // The status-only message is safe and sufficient for non-JSON failures.
  }
  return new Error(message);
};

const postJson = async <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
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
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) throw await readError(response);
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
      if (event.type === 'error') streamError = new Error(event.message);
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
      galleryContext: { ...galleryContext, selectedModel },
    },
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
      targetPost,
      updatedComments,
      galleryContext: { ...galleryContext, selectedModel },
    },
    signal,
  );

export const getWorldviewFeedback = async (
  customWorldviewText: string,
  galleryData: GalleryData,
  selectedModel: string,
  selectedProvider?: AiProvider,
  signal?: AbortSignal,
): Promise<string> => {
  const aiSafeGalleryData: GalleryData = {
    galleryTitle: galleryData.galleryTitle,
    posts: galleryData.posts,
    ...(galleryData.warnings ? { warnings: galleryData.warnings } : {}),
  };
  const payload = await postJson<{ feedback: string }>(
    '/api/ai/worldview-feedback',
    {
      customWorldviewText,
      galleryData: aiSafeGalleryData,
      selectedModel,
      selectedProvider,
    },
    signal,
  );
  return payload.feedback;
};
