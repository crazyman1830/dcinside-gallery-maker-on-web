import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  GalleryData,
  GalleryContextParams,
  NewPostData,
  Post,
} from '../types';
import {
  addFollowUpComments,
  addUserPost,
  createGalleryStreamed,
  GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES,
  getWorldviewFeedback,
  NDJSON_MAX_LINE_BYTES,
  NDJSON_MAX_TOTAL_BYTES,
  parseNdjsonStream,
} from '../services/galleryService';
import { ApiError } from '../services/apiError';

const requestContext = {
  topic: 'topic',
  discussionContext: '',
  worldviewValue: 'NONE',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel: 'gemini-2.5-flash',
  useSearch: false,
} satisfies CreateGalleryParams;

const context = {
  ...requestContext,
  worldlineId: 'WL-1234-ABCD-5678',
} satisfies GalleryContextParams;

const comment: Comment = {
  id: 'comment-1',
  author: 'commenter',
  text: 'comment',
  timestamp: '2026-08-14T00:00:00.000Z',
  recommendations: 1,
  nonRecommendations: 0,
};

const post: Post = {
  id: 'post-1',
  title: 'title',
  author: 'author',
  timestamp: '2026-08-14T00:00:00.000Z',
  content: 'content',
  views: 10,
  recommendations: 2,
  nonRecommendations: 1,
  comments: [comment],
};

const gallery: GalleryData = { galleryTitle: 'gallery', posts: [post] };
const initialGallery: GalleryData = {
  galleryTitle: 'gallery',
  posts: Array.from({ length: 5 }, (_, index) => ({
    ...post,
    id: `post-${index + 1}`,
    title: `title-${index + 1}`,
  })),
};

const ndjsonResponse = (events: unknown[]): Response => {
  const body = `${events.map(event => JSON.stringify(event)).join('\n')}\n`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
};

const streamFromText = (text: string): ReadableStream<Uint8Array> => new Response(text).body!;

const stubFetch = (...responses: Array<Response | Error>) => {
  const mock = vi.fn();
  responses.forEach(response => {
    if (response instanceof Error) mock.mockRejectedValueOnce(response);
    else mock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gallery API JSON wrappers', () => {
  it('posts a user post with the selected model and forwards the abort signal', async () => {
    const response: AddUserPostResponse = { post, warnings: [] };
    const fetchMock = stubFetch(Response.json(response));
    const newPostData: NewPostData = { title: 'new', author: 'me', content: 'body' };
    const controller = new AbortController();

    await expect(
      addUserPost(newPostData, context, 'gemini-custom', controller.signal),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/posts', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPostData,
        galleryContext: { ...requestContext, selectedModel: 'gemini-custom' },
      }),
      signal: controller.signal,
    });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.galleryContext).not.toHaveProperty('worldlineId');
  });

  it('returns follow-up comments and exposes a structured API error message', async () => {
    const fetchMock = stubFetch(
      Response.json([comment]),
      Response.json({ error: 'follow-up failed' }, { status: 502 }),
    );

    await expect(addFollowUpComments(post, [comment], context, 'gemini-custom')).resolves.toEqual([
      comment,
    ]);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      targetPost: {
        id: post.id,
        title: post.title,
        author: post.author,
        content: post.content,
      },
      recentComments: [comment],
      totalCommentCount: 1,
      galleryContext: {
        selectedModel: 'gemini-custom',
      },
    });
    expect(requestBody.galleryContext).toEqual({
      ...requestContext,
      selectedModel: 'gemini-custom',
    });
    expect(requestBody.galleryContext).not.toHaveProperty('worldlineId');
    expect(requestBody.targetPost).not.toHaveProperty('comments');
    await expect(addFollowUpComments(post, [comment], context, 'gemini-custom')).rejects.toThrow(
      'follow-up failed',
    );
  });

  it('returns worldview feedback and falls back to the HTTP status for non-JSON errors', async () => {
    const fetchMock = stubFetch(
      Response.json({ feedback: 'clearer constraints would help' }),
      new Response('upstream unavailable', { status: 503 }),
    );

    await expect(
      getWorldviewFeedback(
        'worldview',
        {
          ...gallery,
          sources: [{ uri: 'https://example.test/source' }],
          searchEntryPoint: { renderedContent: '<div>provider markup</div>' },
        },
        'vertex-model',
        'vertex',
      ),
    ).resolves.toBe('clearer constraints would help');
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      selectedModel: 'vertex-model',
      selectedProvider: 'vertex',
    });
    expect(requestBody.gallerySample).toEqual({
      galleryTitle: gallery.galleryTitle,
      posts: [
        {
          title: post.title,
          content: post.content,
          comments: [{ author: comment.author, text: comment.text }],
        },
      ],
    });
    expect(requestBody).not.toHaveProperty('worldlineId');
    expect(requestBody).not.toHaveProperty('galleryData');
    await expect(
      getWorldviewFeedback('worldview', gallery, 'vertex-model', undefined),
    ).rejects.toThrow('HTTP 503');
  });

  it('rejects malformed successful JSON responses instead of trusting TypeScript assertions', async () => {
    stubFetch(
      Response.json({ post: { ...post, views: -1 }, warnings: [] }),
      Response.json([{ ...comment, timestamp: 'not-a-timestamp' }]),
      Response.json({ feedback: 42 }),
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    for (const operation of [
      () => addUserPost({ title: 'new', author: 'me', content: 'body' }, context, 'model'),
      () => addFollowUpComments(post, [comment], context, 'model'),
      () => getWorldviewFeedback('worldview', gallery, 'model', undefined),
      () => getWorldviewFeedback('worldview', gallery, 'model', undefined),
    ]) {
      const error = await operation().catch(reason => reason as unknown);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 502,
        code: 'INVALID_API_RESPONSE',
        retryable: false,
      });
    }
  });
});

describe('streamed gallery creation', () => {
  it('dispatches progress callbacks and merges unique streamed warnings into the result', async () => {
    const duplicateWarning = {
      code: 'COMMENTS_PARTIAL',
      message: 'some comments were omitted',
      stage: 'comments' as const,
      postId: post.id,
    };
    const uniqueWarning = {
      code: 'GROUNDING_PARTIAL',
      message: 'grounding was incomplete',
      stage: 'grounding' as const,
    };
    const result = {
      ...initialGallery,
      sources: [{ title: 'source', uri: 'https://example.com' }],
      warnings: [duplicateWarning],
    };
    const fetchMock = stubFetch(
      ndjsonResponse([
        { type: 'chunk', text: 'partial output' },
        { type: 'phase', phase: 'posts', message: 'creating posts', progress: 50 },
        { type: 'warning', warning: duplicateWarning },
        { type: 'warning', warning: uniqueWarning },
        { type: 'result', data: result },
      ]),
    );
    const onChunk = vi.fn();
    const onPhase = vi.fn();

    await expect(
      createGalleryStreamed(requestContext, onChunk, undefined, onPhase),
    ).resolves.toEqual({
      ...result,
      warnings: [duplicateWarning, uniqueWarning],
    });
    expect(onChunk).toHaveBeenCalledWith('partial output');
    expect(onPhase).toHaveBeenCalledWith('posts', 'creating posts', 50);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/gallery/stream', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(requestContext),
      signal: undefined,
    });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).not.toHaveProperty('worldlineId');
  });

  it('uses an API error payload when the streaming request fails', async () => {
    stubFetch(
      Response.json(
        {
          message: 'generation unavailable',
          code: 'AI_CAPACITY',
          retryable: true,
          requestId: 'request-http',
        },
        { status: 429, headers: { 'Retry-After': '3' } },
      ),
    );
    const error = await createGalleryStreamed(requestContext, vi.fn()).catch(
      reason => reason as unknown,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'generation unavailable',
      status: 429,
      code: 'AI_CAPACITY',
      retryable: true,
      requestId: 'request-http',
      retryAfterSeconds: 3,
    });
  });

  it('rejects successful streams that never emit a result', async () => {
    stubFetch(
      new Response(null, { status: 200 }),
      ndjsonResponse([{ type: 'phase', phase: 'posts' }]),
    );
    await expect(createGalleryStreamed(requestContext, vi.fn())).rejects.toThrow();
    await expect(createGalleryStreamed(requestContext, vi.fn())).rejects.toThrow();
  });

  it('prioritizes an explicit stream error even if a result was also emitted', async () => {
    stubFetch(
      ndjsonResponse([
        { type: 'result', data: initialGallery },
        {
          type: 'error',
          message: 'stream generation failed',
          code: 'UPSTREAM_ERROR',
          retryable: true,
          requestId: 'request-1',
          retryAfterSeconds: 7,
        },
      ]),
    );
    const error = await createGalleryStreamed(requestContext, vi.fn()).catch(
      reason => reason as unknown,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'stream generation failed',
      code: 'UPSTREAM_ERROR',
      retryable: true,
      requestId: 'request-1',
      retryAfterSeconds: 7,
    });
  });
});

describe('NDJSON transport boundaries', () => {
  it('parses split UTF-8 and typed progress metadata', async () => {
    const encoded = new TextEncoder().encode(
      `${JSON.stringify({ type: 'chunk', text: '한🙂글' })}\n`,
    );
    const multibyteStart = encoded.findIndex(byte => byte >= 0x80);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, multibyteStart + 1));
        controller.enqueue(encoded.slice(multibyteStart + 1));
        controller.close();
      },
    });
    const events: unknown[] = [];

    await parseNdjsonStream(stream, event => events.push(event));
    expect(events).toEqual([{ type: 'chunk', text: '한🙂글' }]);
    const metadata: unknown[] = [];
    await parseNdjsonStream(
      streamFromText(
        [
          '{"type":"phase","phase":"posts","message":"댓글 생성 중","progress":70}',
          '{"type":"warning","warning":{"code":"COMMENTS_PARTIAL","message":"일부 댓글 누락","stage":"comments","postId":"post-1"}}',
          '{"type":"error","message":"잠시 후 재시도","code":"RATE_LIMIT","retryable":true,"requestId":"req-1"}',
          '',
        ].join('\n'),
      ),
      event => metadata.push(event),
    );
    expect(metadata).toHaveLength(3);
  });

  it('rejects malformed JSON and invalid event envelopes', async () => {
    await expect(parseNdjsonStream(streamFromText('not-json\n'), vi.fn())).rejects.toThrow(
      '올바르지 않은 스트림',
    );
    for (const event of [
      null,
      {},
      { type: 'chunk', text: 12 },
      { type: 'phase', phase: 12 },
      { type: 'phase', phase: 'posts' },
      { type: 'phase', phase: 'unknown' },
      { type: 'phase', phase: 'posts', progress: 101 },
      { type: 'warning', warning: { message: 'missing code' } },
      { type: 'error', message: 'bad', retryable: 'yes' },
      { type: 'error', message: 'bad', code: 'BAD', retryable: false },
      { type: 'error', message: 'bad', retryAfterSeconds: 61 },
      { type: 'result', data: { galleryTitle: 'x', posts: 'not-an-array' } },
      { type: 'result', data: gallery },
      {
        type: 'result',
        data: { galleryTitle: 'x', posts: [{ ...post, views: -1 }] },
      },
      {
        type: 'result',
        data: {
          galleryTitle: 'x',
          posts: [],
          sources: [{ uri: 'http://example.test/source' }],
        },
      },
      { type: 'chunk', text: 'x', unexpected: true },
      { type: 'unknown', text: 'x' },
    ]) {
      await expect(
        parseNdjsonStream(streamFromText(`${JSON.stringify(event)}\n`), vi.fn()),
      ).rejects.toThrow('올바르지 않은 스트림 이벤트');
    }
  });

  it('preserves valid Search Suggestions and rejects oversized markup', async () => {
    const renderedContent = '<style>.chip { color: blue; }</style><a>검색어</a>';
    const events: unknown[] = [];
    await parseNdjsonStream(
      streamFromText(
        `${JSON.stringify({
          type: 'result',
          data: { ...initialGallery, searchEntryPoint: { renderedContent } },
        })}\n`,
      ),
      event => events.push(event),
    );
    expect(events[0]).toMatchObject({
      type: 'result',
      data: { searchEntryPoint: { renderedContent } },
    });

    const oversized = '가'.repeat(GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES);
    await expect(
      parseNdjsonStream(
        streamFromText(
          `${JSON.stringify({
            type: 'result',
            data: {
              ...initialGallery,
              searchEntryPoint: { renderedContent: oversized },
            },
          })}\n`,
        ),
        vi.fn(),
      ),
    ).rejects.toThrow('올바르지 않은 스트림 이벤트');
  });

  it('enforces per-line and total byte budgets', async () => {
    const oversizedLine = JSON.stringify({
      type: 'chunk',
      text: 'x'.repeat(NDJSON_MAX_LINE_BYTES),
    });
    await expect(parseNdjsonStream(streamFromText(oversizedLine), vi.fn())).rejects.toThrow(
      '한 줄 크기',
    );

    const line = `${JSON.stringify({ type: 'chunk', text: 'x'.repeat(128 * 1024) })}\n`;
    const payload = line.repeat(
      Math.ceil(NDJSON_MAX_TOTAL_BYTES / new TextEncoder().encode(line).byteLength) + 1,
    );
    await expect(parseNdjsonStream(streamFromText(payload), vi.fn())).rejects.toThrow('전체 크기');
  });

  it('cancels the reader when parsing is aborted', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const parsing = parseNdjsonStream(stream, vi.fn(), controller.signal);
    controller.abort();

    await expect(parsing).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true);
  });
});
