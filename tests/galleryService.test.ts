import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  GalleryData,
  NewPostData,
  Post,
} from '../types';
import {
  addFollowUpComments,
  addUserPost,
  createGalleryStreamed,
  getWorldviewFeedback,
  NDJSON_MAX_LINE_BYTES,
  parseNdjsonStream,
} from '../services/galleryService';

const context = {
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

const ndjsonResponse = (events: unknown[]): Response => {
  const body = `${events.map(event => JSON.stringify(event)).join('\n')}\n`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
};

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
        galleryContext: { ...context, selectedModel: 'gemini-custom' },
      }),
      signal: controller.signal,
    });
  });

  it('returns follow-up comments and exposes a structured API error message', async () => {
    stubFetch(
      Response.json([comment]),
      Response.json({ error: 'follow-up failed' }, { status: 502 }),
    );

    await expect(addFollowUpComments(post, [comment], context, 'gemini-custom')).resolves.toEqual([
      comment,
    ]);
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
    expect(requestBody.galleryData).toEqual(gallery);
    expect(requestBody.galleryData).not.toHaveProperty('sources');
    expect(requestBody.galleryData).not.toHaveProperty('searchEntryPoint');
    await expect(getWorldviewFeedback('worldview', gallery, 'vertex-model')).rejects.toThrow(
      'HTTP 503',
    );
  });

  it('propagates transport failures without rewriting them', async () => {
    stubFetch(new TypeError('network offline'));
    await expect(addUserPost({} as NewPostData, context, 'model')).rejects.toThrow(
      'network offline',
    );
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
      ...gallery,
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

    await expect(createGalleryStreamed(context, onChunk, undefined, onPhase)).resolves.toEqual({
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
      body: JSON.stringify(context),
      signal: undefined,
    });
  });

  it('returns a result unchanged when the stream contains no warnings', async () => {
    stubFetch(ndjsonResponse([{ type: 'result', data: gallery }]));
    await expect(createGalleryStreamed(context, vi.fn())).resolves.toBeDefined();
  });

  it('uses an API error payload when the streaming request fails', async () => {
    stubFetch(Response.json({ message: 'generation unavailable' }, { status: 429 }));
    await expect(createGalleryStreamed(context, vi.fn())).rejects.toThrow('generation unavailable');
  });

  it('rejects a successful response that has no readable body', async () => {
    stubFetch(new Response(null, { status: 200 }));
    await expect(createGalleryStreamed(context, vi.fn())).rejects.toThrow();
  });

  it('rejects when the stream closes before emitting a result', async () => {
    stubFetch(ndjsonResponse([{ type: 'phase', phase: 'posts' }]));
    await expect(createGalleryStreamed(context, vi.fn())).rejects.toThrow();
  });

  it('prioritizes an explicit stream error even if a result was also emitted', async () => {
    stubFetch(
      ndjsonResponse([
        { type: 'result', data: gallery },
        {
          type: 'error',
          message: 'stream generation failed',
          code: 'UPSTREAM_ERROR',
          retryable: true,
          requestId: 'request-1',
        },
      ]),
    );
    await expect(createGalleryStreamed(context, vi.fn())).rejects.toThrow(
      'stream generation failed',
    );
  });
});

describe('NDJSON transport boundaries', () => {
  it('decodes a multibyte character split across byte chunks', async () => {
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
  });

  it('uses a custom abort reason when parsing starts after cancellation', async () => {
    const reason = new Error('cancelled by caller');
    const controller = new AbortController();
    controller.abort(reason);
    const stream = new ReadableStream<Uint8Array>();

    await expect(parseNdjsonStream(stream, vi.fn(), controller.signal)).rejects.toBe(reason);
  });

  it('creates an AbortError when an already-aborted signal has no Error reason', async () => {
    const signal = {
      aborted: true,
      reason: undefined,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;

    await expect(
      parseNdjsonStream(new ReadableStream<Uint8Array>(), vi.fn(), signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects an oversized complete line before dispatching it', async () => {
    const oversized = `${JSON.stringify({
      type: 'chunk',
      text: 'x'.repeat(NDJSON_MAX_LINE_BYTES),
    })}\n`;

    await expect(parseNdjsonStream(new Response(oversized).body!, vi.fn())).rejects.toThrow();
  });

  it.each([
    null,
    {},
    { type: 'phase', phase: 'posts', message: 1 },
    { type: 'phase', phase: 'posts', progress: Number.POSITIVE_INFINITY },
    { type: 'warning', warning: { code: 'X', message: 'bad', stage: 'unknown' } },
    { type: 'error', message: 'bad', retryable: 'yes' },
    { type: 'error', message: 'bad', code: 1 },
    { type: 'result', data: { galleryTitle: 'x', posts: [{ ...post, comments: [{}] }] } },
    { type: 'result', data: { ...gallery, sources: 'not-an-array' } },
    { type: 'result', data: { ...gallery, warnings: [{ code: 'X' }] } },
  ])('rejects an invalid event envelope: %j', async event => {
    const stream = new Response(`${JSON.stringify(event)}\n`).body;
    expect(stream).not.toBeNull();
    await expect(parseNdjsonStream(stream!, vi.fn())).rejects.toThrow();
  });

  it('accepts all optional post and comment fields in a result event', async () => {
    const richGallery: GalleryData = {
      galleryTitle: 'rich gallery',
      posts: [
        {
          ...post,
          isBestPost: true,
          voted: 'rec',
          comments: [
            {
              ...comment,
              voted: 'nonrec',
              replyTo: { commentId: 'parent', author: 'parent author' },
            },
          ],
        },
      ],
      sources: [{}, { title: 'title' }, { uri: 'https://example.com' }],
      warnings: [{ code: 'STORAGE', message: 'not persisted', stage: 'storage' }],
    };
    const events: unknown[] = [];

    await parseNdjsonStream(
      new Response(`${JSON.stringify({ type: 'result', data: richGallery })}\n`).body!,
      event => events.push(event),
    );
    expect(events).toEqual([{ type: 'result', data: richGallery }]);
  });
});
