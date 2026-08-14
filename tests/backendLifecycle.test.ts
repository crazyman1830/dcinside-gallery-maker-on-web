import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app';
import { SessionCapacityError, SessionCredentialStore } from '../server/sessionStore';
import { AiAdmissionLimiter, AiCapacityError, AiSessionBusyError } from '../server/ai/admission';

const LOCAL_HOST = '127.0.0.1:8787';

describe('backend request lifecycle hardening', () => {
  it('does not allocate sessions for health, static misses, or unknown APIs', async () => {
    const store = new SessionCredentialStore();
    const app = await createApp({ mode: 'test', serveFrontend: false, store });

    const health = await request(app)
      .get('/healthz')
      .set('Host', LOCAL_HOST)
      .expect(200, { ok: true });
    expect(health.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(health.headers['set-cookie']).toBeUndefined();
    await request(app).get('/missing').set('Host', LOCAL_HOST).expect(404);
    const unknownApi = await request(app)
      .get('/api/not-registered')
      .set('Host', LOCAL_HOST)
      .expect(404);
    expect(unknownApi.body).toMatchObject({
      code: 'API_NOT_FOUND',
      retryable: false,
      requestId: unknownApi.headers['x-request-id'],
    });
    expect(store.size).toBe(0);

    await request(app).get('/api/ai/credentials').set('Host', LOCAL_HOST).expect(200);
    expect(store.size).toBe(1);

    const unknownProvider = await request(app)
      .delete('/api/ai/credentials/not-a-provider')
      .set('Host', LOCAL_HOST)
      .expect(404);
    expect(unknownProvider.body).toMatchObject({
      code: 'AI_PROVIDER_NOT_FOUND',
      retryable: false,
      requestId: unknownProvider.headers['x-request-id'],
    });
  });

  it('returns structured 400 errors for malformed and deeply invalid JSON', async () => {
    const app = await createApp({
      mode: 'test',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });

    const malformed = await request(app)
      .post('/api/ai/posts')
      .set('Host', LOCAL_HOST)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(malformed.body).toMatchObject({
      code: 'INVALID_REQUEST',
      retryable: false,
      requestId: malformed.headers['x-request-id'],
    });

    const nested = await request(app)
      .post('/api/ai/comments/follow-up')
      .set('Host', LOCAL_HOST)
      .send({ targetPost: {}, updatedComments: [{ text: 123 }], galleryContext: {} })
      .expect(400);
    expect(nested.body.code).toBe('INVALID_REQUEST');
    expect(nested.body.field).toBeTruthy();
  });

  it('rejects endpoint payloads above their specific body limit', async () => {
    const app = await createApp({
      mode: 'test',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });
    const response = await request(app)
      .post('/api/ai/gallery/stream')
      .set('Host', LOCAL_HOST)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ topic: 'x'.repeat(20 * 1_024) }))
      .expect(413);
    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', retryable: false });
  });

  it('serves immutable frontend assets and the SPA fallback in production', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'dcgm-static-'));
    const distPath = path.join(temporaryRoot, 'dist');
    await mkdir(distPath);
    await writeFile(path.join(distPath, 'index.html'), '<!doctype html><title>fixture</title>');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(temporaryRoot);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const app = await createApp({
        mode: 'production',
        serveFrontend: true,
        store: new SessionCredentialStore(),
      });
      cwd.mockRestore();

      const staticAsset = await request(app)
        .get('/index.html')
        .set('Host', LOCAL_HOST)
        .set('Accept', 'text/html')
        .expect(200);
      expect(staticAsset.text).toContain('<title>fixture</title>');
      expect(staticAsset.headers['cache-control']).toBe('public, max-age=3600');

      const spaFallback = await request(app)
        .get('/gallery/route')
        .set('Host', LOCAL_HOST)
        .set('Accept', 'text/html')
        .expect(200);
      expect(spaFallback.text).toContain('<title>fixture</title>');

      await request(app)
        .post('/gallery/route')
        .set('Host', LOCAL_HOST)
        .set('Accept', 'text/html')
        .expect(404);
      await request(app)
        .get('/gallery/route')
        .set('Host', LOCAL_HOST)
        .set('Accept', 'application/json')
        .expect(404);
      expect(log).toHaveBeenCalled();
      const diagnostic = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(diagnostic).toMatchObject({ level: 'info', event: 'http_request' });
      expect(diagnostic).not.toHaveProperty('body');
    } finally {
      cwd.mockRestore();
      log.mockRestore();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('maps unexpected middleware failures and session capacity to structured errors', async () => {
    const failingStore = new SessionCredentialStore();
    vi.spyOn(failingStore, 'getOrCreate').mockImplementation(() => {
      throw new Error('raw internal details');
    });
    const failingApp = await createApp({
      mode: 'test',
      serveFrontend: false,
      store: failingStore,
    });
    const internal = await request(failingApp)
      .get('/api/ai/credentials')
      .set('Host', LOCAL_HOST)
      .expect(500);
    expect(internal.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: false,
      requestId: internal.headers['x-request-id'],
    });
    expect(JSON.stringify(internal.body)).not.toContain('raw internal details');

    const fullStore = new SessionCredentialStore(Date.now, 10_000, 1);
    const protectedSession = fullStore.create();
    fullStore.setGemini(protectedSession.id, 'secret');
    const fullApp = await createApp({ mode: 'test', serveFrontend: false, store: fullStore });
    const capacity = await request(fullApp)
      .get('/api/ai/credentials')
      .set('Host', LOCAL_HOST)
      .expect(503);
    expect(capacity.body).toMatchObject({ code: 'SESSION_CAPACITY', retryable: true });
    expect(capacity.headers['retry-after']).toBe('1');
  });
});

describe('AI admission limiter', () => {
  it('rejects the same session and process-wide excess without queueing', async () => {
    const limiter = new AiAdmissionLimiter(1);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const first = limiter.run('session-1', () => gate);
    await Promise.resolve();

    await expect(limiter.run('session-1', async () => undefined)).rejects.toBeInstanceOf(
      AiSessionBusyError,
    );
    expect(new AiSessionBusyError()).toMatchObject({
      status: 429,
      retryAfterSeconds: 2,
    });
    await expect(limiter.run('session-2', async () => undefined)).rejects.toBeInstanceOf(
      AiCapacityError,
    );
    expect(new AiCapacityError().retryAfterSeconds).toBe(2);
    expect(limiter.activeCount).toBe(1);

    release();
    await first;
    await expect(limiter.run('session-2', async () => 'ok')).resolves.toBe('ok');
    expect(limiter.activeCount).toBe(0);
  });
});

describe('bounded session store', () => {
  it('evicts the least-recent credential-free session first', () => {
    let now = 0;
    const store = new SessionCredentialStore(() => now, 10_000, 2);
    const first = store.create();
    now += 1;
    const second = store.create();
    now += 1;
    store.get(second.id);
    const third = store.create();

    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)).toBeDefined();
    expect(store.get(third.id)).toBeDefined();
    expect(store.size).toBe(2);
  });

  it('does not evict sessions that contain credentials', () => {
    const store = new SessionCredentialStore(Date.now, 10_000, 1);
    const session = store.create();
    store.setGemini(session.id, 'secret');
    expect(() => store.create()).toThrow(SessionCapacityError);
    expect(store.get(session.id)?.gemini?.apiKey).toBe('secret');
  });
});
