import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

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
  const client = { models: {} };
  const getClient = vi.fn(() => client);
  const assertModelAllowed = vi.fn();
  const app = express();
  app.use(express.json());
  app.use('/api/ai', createGenerationRouter({
    getSessionId: () => 'session-1',
    getClient,
    assertModelAllowed,
    requestTimeoutMs,
  }));
  return { app, assertModelAllowed, client, getClient };
};

describe('generation provider routing', () => {
  it('uses the same selected provider for model validation and client creation', async () => {
    const { app, assertModelAllowed, getClient } = createTestApp();

    await request(app)
      .post('/api/ai/worldview-feedback')
      .send({
        selectedProvider: 'vertex',
        selectedModel: 'vertex-model',
        customWorldviewText: 'worldview',
        galleryData: { galleryTitle: 'test', posts: [] },
      })
      .expect(200, { feedback: 'test feedback' });

    expect(assertModelAllowed).toHaveBeenCalledWith('vertex', 'vertex-model');
    expect(getClient).toHaveBeenCalledWith('session-1', 'vertex');
    expect(engine.createWorldviewFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ models: {} }),
      'worldview',
      { galleryTitle: 'test', posts: [] },
      'vertex-model',
      expect.any(AbortSignal),
    );
  });

  it('passes the selected provider client through gallery, evaluation/comment engine, and follow-ups', async () => {
    const { app, assertModelAllowed, client, getClient } = createTestApp();
    const post = {
      id: 'post-1',
      title: 'title',
      author: 'author',
      content: 'content',
      timestamp: 'now',
      views: 0,
      recommendations: 0,
      nonRecommendations: 0,
      comments: [],
    };
    engine.createGallery.mockResolvedValueOnce({ galleryTitle: 'gallery', posts: [post] });
    engine.createUserPost.mockResolvedValueOnce(post);
    engine.createFollowUpComments.mockResolvedValueOnce([]);

    await request(app).post('/api/ai/gallery/stream').send(galleryContext).expect(200);
    await request(app).post('/api/ai/posts').send({
      newPostData: { title: 'title', author: 'author', content: 'content' },
      galleryContext,
    }).expect(200);
    await request(app).post('/api/ai/comments/follow-up').send({
      targetPost: post,
      updatedComments: [],
      galleryContext,
    }).expect(200);

    expect(assertModelAllowed).toHaveBeenCalledTimes(3);
    expect(assertModelAllowed).toHaveBeenCalledWith('vertex', 'vertex-model');
    expect(getClient).toHaveBeenCalledTimes(3);
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
  });

  it('aborts a hung request on timeout and releases the session lock', async () => {
    const { app } = createTestApp(5);
    engine.createWorldviewFeedback.mockImplementationOnce((...args: unknown[]) => {
      const signal = args[4] as AbortSignal;
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'AbortError'));
        }, { once: true });
      });
    });

    const payload = {
      selectedProvider: 'vertex',
      selectedModel: 'vertex-model',
      customWorldviewText: 'worldview',
      galleryData: { galleryTitle: 'test', posts: [] },
    };
    await request(app).post('/api/ai/worldview-feedback').send(payload).expect(499);

    engine.createWorldviewFeedback.mockResolvedValueOnce('after timeout');
    await request(app)
      .post('/api/ai/worldview-feedback')
      .send(payload)
      .expect(200, { feedback: 'after timeout' });
  });
});
