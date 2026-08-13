import type {
  AiProvider,
  Comment,
  CreateGalleryParams,
  GalleryData,
  GalleryContextParams,
  NewPostData,
  Post,
} from '../types';
export type { CreateGalleryParams, GalleryContextParams, NewPostData } from '../types';

type GalleryStreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'phase'; phase: string; message?: string }
  | { type: 'result'; data: GalleryData }
  | { type: 'error'; message: string };

const readError = async (response: Response): Promise<Error> => {
  let message = `요청에 실패했습니다. (HTTP ${response.status})`;
  try {
    const payload = await response.json() as { error?: string; message?: string };
    message = payload.error || payload.message || message;
  } catch {
    // The status-only message is safe and sufficient for non-JSON failures.
  }
  return new Error(message);
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  let buffer = '';

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
    let event: GalleryStreamEvent;
    try {
      event = JSON.parse(line) as GalleryStreamEvent;
    } catch {
      throw new Error('로컬 AI 서버가 올바르지 않은 스트림 데이터를 반환했습니다.');
    }
    onEvent(event);
  };

  try {
    throwIfAborted();
    signal?.addEventListener('abort', cancelReader, { once: true });
    while (true) {
      const { value, done } = await reader.read();
      throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
      if (done) break;
    }
    consumeLine(buffer);
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
};

export const createGalleryStreamed = async (
  params: CreateGalleryParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
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
  await parseNdjsonStream(response.body, event => {
    if (event.type === 'chunk') onChunk(event.text);
    if (event.type === 'result') result = event.data;
    if (event.type === 'error') streamError = new Error(event.message);
  }, signal);

  if (streamError) throw streamError;
  if (!result) throw new Error('갤러리 생성 결과가 완료되기 전에 연결이 종료되었습니다.');
  return result;
};

export const addUserPost = async (
  newPostData: NewPostData,
  galleryContext: GalleryContextParams,
  selectedModel: string,
): Promise<Post> => postJson<Post>('/api/ai/posts', {
  newPostData,
  galleryContext: { ...galleryContext, selectedModel },
});

export const addFollowUpComments = async (
  targetPost: Post,
  updatedComments: Comment[],
  galleryContext: GalleryContextParams,
  selectedModel: string,
): Promise<Comment[]> => postJson<Comment[]>('/api/ai/comments/follow-up', {
  targetPost,
  updatedComments,
  galleryContext: { ...galleryContext, selectedModel },
});

export const getWorldviewFeedback = async (
  customWorldviewText: string,
  galleryData: GalleryData,
  selectedModel: string,
  selectedProvider?: AiProvider,
): Promise<string> => {
  const payload = await postJson<{ feedback: string }>('/api/ai/worldview-feedback', {
    customWorldviewText,
    galleryData,
    selectedModel,
    selectedProvider,
  });
  return payload.feedback;
};
