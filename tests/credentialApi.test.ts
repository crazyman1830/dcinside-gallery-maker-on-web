import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { generateKeyPairSync } from 'node:crypto';
import { createApp } from '../server/app';
import { SessionCredentialStore } from '../server/sessionStore';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1_024 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const validCredential = {
  type: 'service_account',
  project_id: 'sample-project-123',
  client_email: 'local-test@sample-project-123.iam.gserviceaccount.com',
  private_key: privateKeyPem,
  token_uri: 'https://oauth2.googleapis.com/token',
  private_key_id: 'must-not-be-returned',
};

const local = (app: Awaited<ReturnType<typeof createApp>>) =>
  request(app).get('/api/ai/credentials').set('Host', '127.0.0.1:8787');

describe('credential API security boundary', () => {
  it('issues an HttpOnly SameSite=Strict session cookie and security headers', async () => {
    const app = await createApp({
      mode: 'test',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });
    const response = await local(app).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain('dcgm_session=');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Strict');
    expect(cookies[0]).toContain('Path=/api/ai');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('relaxes only the Vite runtime directives in development mode', async () => {
    const app = await createApp({
      mode: 'development',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });
    const response = await request(app).get('/healthz').set('Host', '127.0.0.1:8787').expect(200);

    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(response.headers['content-security-policy']).toContain("connect-src 'self' ws:");
    expect(response.headers['content-security-policy']).toContain("object-src 'none'");
  });

  it('rejects non-loopback Host and Origin headers', async () => {
    const app = await createApp({
      mode: 'test',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });

    await request(app).get('/api/ai/credentials').set('Host', 'example.com').expect(403);
    await request(app)
      .get('/api/ai/credentials')
      .set('Host', '127.0.0.1:8787')
      .set('Origin', 'https://example.com')
      .expect(403);
    await request(app)
      .get('/api/ai/credentials')
      .set('Host', '127.0.0.1:8787')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
    await request(app)
      .get('/api/ai/credentials')
      .set('Host', 'localhost:8787')
      .set('Origin', 'http://localhost:8787')
      .expect(200);
  });

  it('keeps credentials isolated by cookie and returns status without secrets', async () => {
    const store = new SessionCredentialStore();
    const app = await createApp({ mode: 'test', serveFrontend: false, store });
    const first = request.agent(app);
    const second = request.agent(app);

    const registered = await first
      .post('/api/ai/credentials/vertex/service-account')
      .set('Host', '127.0.0.1:8787')
      .send({ credentials: validCredential })
      .expect(201);
    expect(registered.body.providers.vertex).toEqual({
      configured: true,
      authMode: 'service_account',
      projectId: 'sample-project-123',
      location: 'global',
    });
    expect(JSON.stringify(registered.body)).not.toContain('TEST-ONLY');
    expect(JSON.stringify(registered.body)).not.toContain('private_key_id');

    const firstStatus = await first
      .get('/api/ai/credentials')
      .set('Host', '127.0.0.1:8787')
      .expect(200);
    const secondStatus = await second
      .get('/api/ai/credentials')
      .set('Host', '127.0.0.1:8787')
      .expect(200);
    expect(firstStatus.body.providers.vertex.configured).toBe(true);
    expect(secondStatus.body.providers.vertex.configured).toBe(false);

    await first.delete('/api/ai/credentials/vertex').set('Host', '127.0.0.1:8787').expect(204);
    const deletedStatus = await first
      .get('/api/ai/credentials')
      .set('Host', '127.0.0.1:8787')
      .expect(200);
    expect(deletedStatus.body.providers.vertex.configured).toBe(false);
  });

  it('rejects credential request bodies over 64 KiB', async () => {
    const app = await createApp({
      mode: 'test',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });
    const response = await request(app)
      .post('/api/ai/credentials/gemini')
      .set('Host', '127.0.0.1:8787')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ apiKey: 'x'.repeat(70 * 1024) }))
      .expect(413);

    expect(response.body).toHaveProperty('error');
  });
});
