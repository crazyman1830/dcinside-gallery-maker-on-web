import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';

const engine = vi.hoisted(() => ({
  createGallery: vi.fn(),
  createUserPost: vi.fn(),
  createFollowUpComments: vi.fn(),
  createWorldviewFeedback: vi.fn(async () => 'test feedback'),
}));

vi.mock('../server/galleryEngine', () => ({
  createGallery: engine.createGallery,
  createUserPost: engine.createUserPost,
  createFollowUpComments: engine.createFollowUpComments,
  createWorldviewFeedback: engine.createWorldviewFeedback,
}));

import { createGenerationRouter } from '../server/routes/generationRoutes';

const galleryContext = {
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
} as const;

const createTestApp = (requestTimeoutMs?: number) => {
  const client = { models: {} } as unknown as GoogleGenAI;
  const getClient = vi.fn(() => client);
  const assertModelAllowed = vi.fn();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/ai',
    createGenerationRouter({
      getSessionId: () => 'session-1',
      getClient,
      assertModelAllowed,
      requestTimeoutMs,
    }),
  );
  return { app, assertModelAllowed, client, getClient };
};

describe('generation provider routing', () => {
  it('passes the selected provider client through every generation route', async () => {
    const { app, assertModelAllowed, client, getClient } = createTestApp();
    const post = {
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
    engine.createGallery.mockResolvedValueOnce({ galleryTitle: 'gallery', posts: [post] });
    engine.createUserPost.mockResolvedValueOnce({ post, warnings: [] });
    engine.createFollowUpComments.mockResolvedValueOnce([]);

    await request(app).post('/api/ai/gallery/stream').send(galleryContext).expect(200);
    await request(app)
      .post('/api/ai/posts')
      .send({
        newPostData: { title: 'title', author: 'author', content: 'content' },
        galleryContext,
      })
      .expect(200);
    await request(app)
      .post('/api/ai/comments/follow-up')
      .send({
        targetPost: post,
        updatedComments: [],
        galleryContext,
      })
      .expect(200);
    await request(app)
      .post('/api/ai/worldview-feedback')
      .send({
        selectedProvider: 'vertex',
        selectedModel: 'vertex-model',
        customWorldviewText: 'worldview',
        galleryData: { galleryTitle: 'test', posts: [] },
      })
      .expect(200, { feedback: 'test feedback' });

    expect(assertModelAllowed).toHaveBeenCalledTimes(4);
    expect(assertModelAllowed).toHaveBeenCalledWith('vertex', 'vertex-model');
    expect(getClient).toHaveBeenCalledTimes(4);
    expect(getClient).toHaveBeenCalledWith('session-1', 'vertex');
    expect(engine.createGallery).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ selectedProvider: 'vertex' }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
    expect(engine.createUserPost).toHaveBeenCalledWith(
      client,
      expect.any(Object),
      expect.objectContaining({ selectedProvider: 'vertex' }),
      expect.any(AbortSignal),
    );
    expect(engine.createFollowUpComments).toHaveBeenCalledWith(
      client,
      post,
      [],
      expect.objectContaining({ selectedProvider: 'vertex' }),
      expect.any(AbortSignal),
    );
    expect(engine.createWorldviewFeedback).toHaveBeenCalledWith(
      client,
      'worldview',
      { galleryTitle: 'test', posts: [] },
      'vertex-model',
      expect.any(AbortSignal),
    );
  });

  it('times out a provider that ignores abort and releases the session lock', async () => {
    const { app } = createTestApp(5);
    engine.createWorldviewFeedback.mockImplementationOnce(
      () => new Promise<string>(() => undefined),
    );

    const payload = {
      selectedProvider: 'vertex',
      selectedModel: 'vertex-model',
      customWorldviewText: 'worldview',
      galleryData: { galleryTitle: 'test', posts: [] },
    };
    const timedOut = await request(app)
      .post('/api/ai/worldview-feedback')
      .send(payload)
      .expect(504);
    expect(timedOut.body).toMatchObject({ code: 'AI_TIMEOUT', retryable: true });

    engine.createWorldviewFeedback.mockResolvedValueOnce('after timeout');
    await request(app)
      .post('/api/ai/worldview-feedback')
      .send(payload)
      .expect(200, { feedback: 'after timeout' });
  });
});
