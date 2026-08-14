import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';

const provider = vi.hoisted(() => ({
  assertModelAllowed: vi.fn(),
  createProviderClient: vi.fn(),
  getDefaultModel: vi.fn(() => 'default-gemini-model'),
}));

vi.mock('../server/ai/provider', () => ({
  assertModelAllowed: provider.assertModelAllowed,
  createProviderClient: provider.createProviderClient,
  EVALUATION_MODEL: {
    gemini: 'evaluation-gemini-model',
    vertex: 'evaluation-vertex-model',
  },
  getDefaultModel: provider.getDefaultModel,
}));

import { AiCapacityError } from '../server/ai/admission';
import { requestIdMiddleware } from '../server/http';
import { createCredentialRouter } from '../server/routes/credentialRoutes';
import { SessionCredentialStore } from '../server/sessionStore';

interface GenerateRequest {
  model: string;
  config: { abortSignal: AbortSignal };
}

type GenerateContent = (request: GenerateRequest) => Promise<{ text: string }>;

interface FixtureOptions {
  generateContent?: ReturnType<typeof vi.fn<GenerateContent>>;
  limiter?: { run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> };
  timeoutMs?: number;
  allowVertexAdc?: boolean;
}

const makeFixture = ({
  generateContent = vi.fn<GenerateContent>(async () => ({ text: 'OK' })),
  limiter: customLimiter,
  timeoutMs = 100,
  allowVertexAdc = true,
}: FixtureOptions = {}) => {
  const limiterRun = vi.fn();
  const limiter = customLimiter ?? {
    async run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
      limiterRun(sessionId, operation);
      return operation();
    },
  };
  const store = new SessionCredentialStore();
  const session = store.create();
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  provider.createProviderClient.mockReturnValue(client);
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    createCredentialRouter({
      store,
      sessionId: () => session.id,
      limiter,
      connectionTestTimeoutMs: timeoutMs,
      allowVertexAdc,
    }),
  );
  return { app, client, generateContent, limiterRun, session, store };
};

describe('credential routes', () => {
  beforeEach(() => {
    provider.assertModelAllowed.mockReset();
    provider.createProviderClient.mockReset();
    provider.getDefaultModel.mockReset().mockReturnValue('default-gemini-model');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers, reports, and deletes Gemini and ADC credentials', async () => {
    const { app, session, store } = makeFixture();
    await request(app).post('/gemini').send({ apiKey: '  secret-key  ' }).expect(201);
    expect(store.get(session.id)?.gemini?.apiKey).toBe('secret-key');

    const status = await request(app).get('/').expect(200);
    expect(status.body.providers.gemini.configured).toBe(true);

    await request(app).post('/vertex/adc').send({ projectId: 'sample-project-123' }).expect(201);
    expect(store.get(session.id)?.vertex).toMatchObject({
      authMode: 'adc',
      projectId: 'sample-project-123',
    });

    await request(app).delete('/gemini').expect(204);
    expect(store.get(session.id)?.gemini).toBeUndefined();
    await request(app).delete('/vertex').expect(204);
    expect(store.get(session.id)?.vertex).toBeUndefined();

    await request(app)
      .post('/unknown/test')
      .send({})
      .expect(404)
      .expect(response => {
        expect(response.body.code).toBe('AI_PROVIDER_NOT_FOUND');
      });
    await request(app)
      .delete('/unknown')
      .expect(404)
      .expect(response => {
        expect(response.body.code).toBe('AI_PROVIDER_NOT_FOUND');
      });
  });

  it('uses the configured project environment and rejects strict invalid bodies', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'environment-project-123');
    const { app, session, store } = makeFixture();
    await request(app).post('/vertex/adc').send({}).expect(201);
    expect(store.get(session.id)?.vertex).toMatchObject({
      projectId: 'environment-project-123',
    });

    await request(app)
      .post('/gemini')
      .send({ apiKey: '', unexpected: true })
      .expect(400)
      .expect(response => {
        expect(response.body).toMatchObject({ code: 'INVALID_REQUEST', retryable: false });
      });
    await request(app)
      .post('/vertex/adc')
      .send({ projectId: 'INVALID PROJECT' })
      .expect(400)
      .expect(response => {
        expect(response.body.code).toBe('INVALID_PROJECT_ID');
      });
    await request(app)
      .post('/vertex/service-account')
      .send({ credentials: { type: 'service_account' } })
      .expect(400)
      .expect(response => {
        expect(response.body.code).toBe('INVALID_SERVICE_ACCOUNT');
      });
  });

  it('keeps ambient Vertex ADC disabled unless the server opts in', async () => {
    const { app, session, store } = makeFixture({ allowVertexAdc: false });

    const status = await request(app).get('/').expect(200);
    expect(status.body.capabilities).toEqual({ vertexAdc: false });
    await request(app)
      .post('/vertex/adc')
      .send({ projectId: 'sample-project-123' })
      .expect(403)
      .expect(response => {
        expect(response.body).toMatchObject({ code: 'ADC_DISABLED', retryable: false });
      });
    expect(store.get(session.id)?.vertex).toBeUndefined();
  });

  it('tests both the selected and evaluation models under the limiter', async () => {
    const { app, generateContent, limiterRun, session, store } = makeFixture();
    store.setGemini(session.id, 'secret');

    await request(app)
      .post('/gemini/test')
      .send({ model: 'selected-model' })
      .expect(200, { ok: true });
    await request(app).post('/gemini/test').send({}).expect(200, { ok: true });
    await request(app)
      .post('/gemini/test')
      .send({ model: '', extra: true })
      .expect(400)
      .expect(response => {
        expect(response.body.code).toBe('INVALID_REQUEST');
      });

    expect(provider.assertModelAllowed).toHaveBeenCalledWith('gemini', 'selected-model');
    expect(provider.createProviderClient).toHaveBeenCalledWith(session.id, 'gemini', store);
    expect(provider.getDefaultModel).toHaveBeenCalledWith('gemini');
    expect(limiterRun).toHaveBeenCalledWith(session.id, expect.any(Function));
    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(generateContent.mock.calls.map(call => call[0].model)).toEqual([
      'selected-model',
      'evaluation-gemini-model',
      'default-gemini-model',
      'evaluation-gemini-model',
    ]);
    expect(
      generateContent.mock.calls.every(call => call[0].config.abortSignal instanceof AbortSignal),
    ).toBe(true);
  });

  it('surfaces limiter capacity and model validation errors without invoking the provider', async () => {
    const limiter = {
      async run<T>(): Promise<T> {
        throw new AiCapacityError();
      },
    };
    const { app, generateContent } = makeFixture({ limiter });
    const limited = await request(app).post('/gemini/test').send({ model: 'model' }).expect(429);
    expect(limited.headers['retry-after']).toBe('2');
    expect(limited.body.code).toBe('AI_CAPACITY');
    expect(generateContent).not.toHaveBeenCalled();

    provider.assertModelAllowed.mockImplementationOnce(() => {
      throw Object.assign(new Error('not allowed'), { status: 404 });
    });
    await request(app)
      .post('/gemini/test')
      .send({ model: 'not-allowed' })
      .expect(404)
      .expect(response => {
        expect(response.body.code).toBe('AI_MODEL_NOT_FOUND');
      });
  });

  it('times out a provider that ignores AbortSignal and releases the limiter operation', async () => {
    const generateContent = vi.fn<GenerateContent>(() => new Promise<never>(() => undefined));
    const { app } = makeFixture({ generateContent, timeoutMs: 5 });

    await request(app)
      .post('/vertex/test')
      .send({ model: 'selected-model' })
      .expect(504)
      .expect(response => {
        expect(response.body).toMatchObject({ code: 'AI_TIMEOUT', retryable: true });
      });
  });
});
