import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type {
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  GalleryData,
  GenerationWarning,
  NewPostData,
  Post,
} from '../types';

interface StreamCallbacks {
  onChunk: (text: string) => void | Promise<void>;
  onPhase: (phase: 'gallery' | 'posts' | 'complete', message: string) => void | Promise<void>;
  onWarning?: (warning: GenerationWarning) => void | Promise<void>;
}

type CreateGallery = (
  client: GoogleGenAI,
  params: CreateGalleryParams,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) => Promise<GalleryData>;
type CreateUserPost = (
  client: GoogleGenAI,
  post: NewPostData,
  context: CreateGalleryParams,
  signal?: AbortSignal,
) => Promise<AddUserPostResponse>;
type CreateFollowUp = (
  client: GoogleGenAI,
  post: Post,
  comments: Comment[],
  context: CreateGalleryParams,
  signal?: AbortSignal,
) => Promise<Comment[]>;
type CreateFeedback = (
  client: GoogleGenAI,
  worldview: string,
  gallery: GalleryData,
  model: string,
  signal?: AbortSignal,
) => Promise<string>;

const engine = vi.hoisted(() => ({
  createGallery: vi.fn<CreateGallery>(),
  createUserPost: vi.fn<CreateUserPost>(),
  createFollowUpComments: vi.fn<CreateFollowUp>(),
  createWorldviewFeedback: vi.fn<CreateFeedback>(),
}));

vi.mock('../server/galleryEngine', () => ({
  createGallery: engine.createGallery,
  createUserPost: engine.createUserPost,
  createFollowUpComments: engine.createFollowUpComments,
  createWorldviewFeedback: engine.createWorldviewFeedback,
}));

import { AiCapacityError, AiSessionBusyError } from '../server/ai/admission';
import { requestIdMiddleware } from '../server/http';
import {
  createGenerationRouter,
  NDJSON_MAX_LINE_BYTES,
  NDJSON_MAX_TOTAL_BYTES,
} from '../server/routes/generationRoutes';

const galleryContext: CreateGalleryParams = {
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
  selectedProvider: 'vertex',
  selectedModel: 'vertex-model',
  useSearch: false,
};

const post: Post = {
  id: 'post-1',
  title: 'title',
  author: 'author',
  content: 'content',
  timestamp: '2026-08-14T00:00:00.000Z',
  views: 0,
  recommendations: 0,
  nonRecommendations: 0,
  comments: [],
};

interface FixtureOptions {
  timeoutMs?: number;
  getClient?: (
    sessionId: string,
    provider: 'gemini' | 'vertex',
  ) => GoogleGenAI | Promise<GoogleGenAI>;
  limiter?: { run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> };
  forceBackpressure?: boolean;
}

const makeFixture = ({
  timeoutMs,
  getClient: customGetClient,
  limiter: customLimiter,
  forceBackpressure = false,
}: FixtureOptions = {}) => {
  const client = { models: {} } as unknown as GoogleGenAI;
  const getClient = vi.fn(customGetClient ?? (() => client));
  const assertModelAllowed = vi.fn();
  const limiterRun = vi.fn();
  const limiter = customLimiter ?? {
    async run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
      limiterRun(sessionId, operation);
      return operation();
    },
  };
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  if (forceBackpressure) {
    app.use((_request, response, next) => {
      const originalWrite = response.write.bind(response);
      let firstWrite = true;
      response.write = ((chunk: string) => {
        const result = originalWrite(chunk);
        if (!firstWrite) return result;
        firstWrite = false;
        queueMicrotask(() => response.emit('drain'));
        return false;
      }) as typeof response.write;
      next();
    });
  }
  app.use(
    '/api/ai',
    createGenerationRouter({
      getSessionId: () => 'session-1',
      getClient,
      assertModelAllowed,
      limiter,
      requestTimeoutMs: timeoutMs,
    }),
  );
  return { app, assertModelAllowed, client, getClient, limiterRun };
};

const parseEvents = (text: string): Array<Record<string, unknown>> =>
  text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);

describe('generation route lifecycle', () => {
  beforeEach(() => {
    engine.createGallery.mockReset().mockResolvedValue({ galleryTitle: 'gallery', posts: [] });
    engine.createUserPost.mockReset().mockResolvedValue({ post, warnings: [] });
    engine.createFollowUpComments.mockReset().mockResolvedValue([]);
    engine.createWorldviewFeedback.mockReset().mockResolvedValue('feedback');
  });

  it('rejects search-grounded contexts before model checks, admission, or provider access', async () => {
    const { app, assertModelAllowed, getClient, limiterRun } = makeFixture();
    const searchContext = { ...galleryContext, useSearch: true };
    const expectedError = {
      error: 'Google Search 기반 생성은 이 릴리스에서 사용할 수 없습니다.',
      code: 'SEARCH_GROUNDING_DISABLED',
      retryable: false,
    };

    await request(app)
      .post('/api/ai/gallery/stream')
      .send(searchContext)
      .expect(400)
      .expect(response => expect(response.body).toMatchObject(expectedError));
    await request(app)
      .post('/api/ai/posts')
      .send({
        newPostData: { title: 'title', author: 'author', content: 'content' },
        galleryContext: searchContext,
      })
      .expect(400)
      .expect(response => expect(response.body).toMatchObject(expectedError));
    await request(app)
      .post('/api/ai/comments/follow-up')
      .send({ targetPost: post, updatedComments: [], galleryContext: searchContext })
      .expect(400)
      .expect(response => expect(response.body).toMatchObject(expectedError));

    expect(assertModelAllowed).not.toHaveBeenCalled();
    expect(limiterRun).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
    expect(engine.createGallery).not.toHaveBeenCalled();
    expect(engine.createUserPost).not.toHaveBeenCalled();
    expect(engine.createFollowUpComments).not.toHaveBeenCalled();
  });

  it('streams phases, chunks, warnings, and the result while honoring backpressure', async () => {
    const warning: GenerationWarning = {
      code: 'POST_COMMENTS_FALLBACK',
      message: 'comments degraded',
      stage: 'comments',
      postId: 'post-1',
    };
    engine.createGallery.mockImplementationOnce(async (_client, _params, callbacks) => {
      await callbacks.onPhase('gallery', 'starting');
      await callbacks.onChunk('{"galleryTitle":');
      await callbacks.onWarning?.(warning);
      return { galleryTitle: 'gallery', posts: [], warnings: [warning] };
    });
    const { app, limiterRun } = makeFixture({ forceBackpressure: true });

    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(200);

    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(parseEvents(response.text).map(event => event.type)).toEqual([
      'phase',
      'chunk',
      'warning',
      'result',
    ]);
    expect(limiterRun).toHaveBeenCalledWith('session-1', expect.any(Function));
  });

  it('emits a structured terminal event when a started stream fails', async () => {
    engine.createGallery.mockImplementationOnce(async (_client, _params, callbacks) => {
      await callbacks.onPhase('posts', 'enriching');
      throw Object.assign(new Error('provider details'), {
        status: 503,
        code: 'AI_PROVIDER_DOWN',
      });
    });
    const { app } = makeFixture();

    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(200);
    const events = parseEvents(response.text);
    expect(events.map(event => event.type)).toEqual(['phase', 'error']);
    expect(events[1]).toMatchObject({
      code: 'AI_PROVIDER_DOWN',
      retryable: true,
      requestId: response.headers['x-request-id'],
    });
  });

  it('emits a timeout event even after the deadline signal has aborted', async () => {
    engine.createGallery.mockImplementationOnce(() => new Promise<GalleryData>(() => undefined));
    const { app } = makeFixture({ timeoutMs: 5 });

    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(200);
    expect(parseEvents(response.text)).toEqual([
      expect.objectContaining({ type: 'error', code: 'AI_TIMEOUT', retryable: true }),
    ]);
  });

  it('rejects an NDJSON line above 512 KiB with a bounded terminal error', async () => {
    engine.createGallery.mockImplementationOnce(async (_client, _params, callbacks) => {
      await callbacks.onChunk('x'.repeat(NDJSON_MAX_LINE_BYTES));
      return { galleryTitle: 'unreachable', posts: [] };
    });
    const { app } = makeFixture();

    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(200);
    const lines = response.text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(Buffer.byteLength(lines[0], 'utf8')).toBeLessThanOrEqual(NDJSON_MAX_LINE_BYTES);
    expect(JSON.parse(lines[0]) as Record<string, unknown>).toMatchObject({
      type: 'error',
      code: 'AI_RESPONSE_TOO_LARGE',
      retryable: false,
    });
  });

  it('caps the entire NDJSON response at 1 MiB including its terminal error', async () => {
    engine.createGallery.mockImplementationOnce(async (_client, _params, callbacks) => {
      const chunk = 'x'.repeat(400 * 1_024);
      await callbacks.onChunk(chunk);
      await callbacks.onChunk(chunk);
      await callbacks.onChunk(chunk);
      return { galleryTitle: 'unreachable', posts: [] };
    });
    const { app } = makeFixture();

    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(200);
    const lines = response.text.trim().split('\n');
    expect(Buffer.byteLength(response.text, 'utf8')).toBeLessThanOrEqual(NDJSON_MAX_TOTAL_BYTES);
    expect(lines.every(line => Buffer.byteLength(line, 'utf8') <= NDJSON_MAX_LINE_BYTES)).toBe(
      true,
    );
    expect(JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>).toMatchObject({
      type: 'error',
      code: 'AI_RESPONSE_TOO_LARGE',
      retryable: false,
    });
  });

  it('measures NDJSON limits in UTF-8 bytes rather than JavaScript characters', async () => {
    engine.createGallery.mockImplementationOnce(async (_client, _params, callbacks) => {
      await callbacks.onChunk('한'.repeat(180 * 1_024));
      return { galleryTitle: 'unreachable', posts: [] };
    });
    const { app } = makeFixture();

    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(200);
    expect(parseEvents(response.text)).toEqual([
      expect.objectContaining({ type: 'error', code: 'AI_RESPONSE_TOO_LARGE' }),
    ]);
  });

  it('returns JSON errors before stream headers are committed', async () => {
    const capacityLimiter = {
      async run<T>(): Promise<T> {
        throw new AiCapacityError();
      },
    };
    const limited = makeFixture({ limiter: capacityLimiter });
    const capacityResponse = await request(limited.app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(429);
    expect(capacityResponse.body).toMatchObject({ code: 'AI_CAPACITY', retryable: true });
    expect(capacityResponse.headers['retry-after']).toBe('2');

    const sessionBusy = makeFixture({
      limiter: {
        async run<T>(): Promise<T> {
          throw new AiSessionBusyError();
        },
      },
    });
    const busyResponse = await request(sessionBusy.app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(429);
    expect(busyResponse.body.code).toBe('AI_SESSION_BUSY');
    expect(busyResponse.headers['retry-after']).toBe('2');

    const unavailable = makeFixture({
      getClient: async () => {
        throw Object.assign(new Error('unavailable'), { status: 503 });
      },
    });
    await request(unavailable.app)
      .post('/api/ai/gallery/stream')
      .send(galleryContext)
      .expect(502)
      .expect(response => {
        expect(response.body.code).toBe('AI_UPSTREAM_ERROR');
      });

    await request(unavailable.app)
      .post('/api/ai/gallery/stream')
      .send({ ...galleryContext, topic: '' })
      .expect(400)
      .expect(response => {
        expect(response.body.code).toBe('INVALID_REQUEST');
      });
  });

  it('applies the request deadline while an asynchronous client is being created', async () => {
    const { app } = makeFixture({
      timeoutMs: 5,
      getClient: () => new Promise<GoogleGenAI>(() => undefined),
    });

    await request(app)
      .post('/api/ai/worldview-feedback')
      .send({
        selectedModel: 'gemini-model',
        customWorldviewText: 'worldview',
        galleryData: { galleryTitle: 'gallery', posts: [] },
      })
      .expect(504)
      .expect(response => {
        expect(response.body.code).toBe('AI_TIMEOUT');
      });
  });

  it('returns structured failures from every non-stream endpoint', async () => {
    const { app } = makeFixture();
    engine.createUserPost.mockRejectedValueOnce(
      Object.assign(new Error('busy'), {
        status: 429,
        code: 'AI_RATE_LIMITED',
        retryAfterSeconds: 3,
      }),
    );
    const postResponse = await request(app)
      .post('/api/ai/posts')
      .send({
        newPostData: { title: 'title', author: 'author', content: 'content' },
        galleryContext,
      })
      .expect(429);
    expect(postResponse.body.code).toBe('AI_RATE_LIMITED');
    expect(postResponse.headers['retry-after']).toBe('3');

    engine.createFollowUpComments.mockRejectedValueOnce(
      Object.assign(new Error('forbidden'), { status: 403 }),
    );
    await request(app)
      .post('/api/ai/comments/follow-up')
      .send({ targetPost: post, updatedComments: [], galleryContext })
      .expect(403)
      .expect(response => {
        expect(response.body.code).toBe('AI_FORBIDDEN');
      });

    engine.createWorldviewFeedback.mockRejectedValueOnce(new Error('unexpected provider details'));
    await request(app)
      .post('/api/ai/worldview-feedback')
      .send({
        selectedProvider: 'vertex',
        selectedModel: 'vertex-model',
        customWorldviewText: 'worldview',
        galleryData: { galleryTitle: 'gallery', posts: [] },
      })
      .expect(500)
      .expect(response => {
        expect(response.body.code).toBe('INTERNAL_ERROR');
      });
  });

  it('defaults feedback to Gemini and validates all non-stream request bodies', async () => {
    const { app, assertModelAllowed, getClient } = makeFixture();
    await request(app)
      .post('/api/ai/worldview-feedback')
      .send({
        selectedModel: 'gemini-model',
        customWorldviewText: 'worldview',
        galleryData: { galleryTitle: 'gallery', posts: [] },
      })
      .expect(200, { feedback: 'feedback' });
    expect(assertModelAllowed).toHaveBeenCalledWith('gemini', 'gemini-model');
    expect(getClient).toHaveBeenCalledWith('session-1', 'gemini');

    await request(app).post('/api/ai/posts').send({}).expect(400);
    await request(app).post('/api/ai/comments/follow-up').send({}).expect(400);
    await request(app).post('/api/ai/worldview-feedback').send({}).expect(400);
  });
});
