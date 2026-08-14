import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ constructorOptions: [] as unknown[] }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    readonly models = { generateContent: vi.fn() };

    constructor(options: unknown) {
      sdk.constructorOptions.push(options);
    }
  },
}));

import { MODEL_ALLOWLIST, assertModelAllowed, createProviderClient } from '../server/ai/provider';
import { SessionCredentialStore } from '../server/sessionStore';

const serviceAccount = {
  type: 'service_account' as const,
  project_id: 'sample-project-123',
  client_email: 'local-test@sample-project-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nTEST-ONLY\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://oauth2.googleapis.com/token',
};

describe('provider client factory', () => {
  beforeEach(() => {
    sdk.constructorOptions.length = 0;
  });

  it('creates a Gemini client with only the session API key', () => {
    const store = new SessionCredentialStore();
    const session = store.create();
    store.setGemini(session.id, 'gemini-test-key');

    createProviderClient(session.id, 'gemini', store);

    expect(sdk.constructorOptions).toEqual([{ apiKey: 'gemini-test-key' }]);
  });

  it('creates a Vertex client with a copied service-account whitelist', () => {
    const store = new SessionCredentialStore();
    const session = store.create();
    store.setVertex(session.id, {
      authMode: 'service_account',
      projectId: serviceAccount.project_id,
      location: 'global',
      credentials: serviceAccount,
    });

    createProviderClient(session.id, 'vertex', store);

    expect(sdk.constructorOptions).toEqual([
      {
        vertexai: true,
        project: serviceAccount.project_id,
        location: 'global',
        googleAuthOptions: { credentials: { ...serviceAccount } },
      },
    ]);
    expect(
      (sdk.constructorOptions[0] as { googleAuthOptions: { credentials: unknown } })
        .googleAuthOptions.credentials,
    ).not.toBe(serviceAccount);
  });

  it('creates a Vertex ADC client without embedding credentials', () => {
    const store = new SessionCredentialStore();
    const session = store.create();
    store.setVertex(session.id, {
      authMode: 'adc',
      projectId: 'sample-project-123',
      location: 'global',
    });

    createProviderClient(session.id, 'vertex', store);

    expect(sdk.constructorOptions).toEqual([
      {
        vertexai: true,
        project: 'sample-project-123',
        location: 'global',
      },
    ]);
  });

  it('rejects missing credentials and models outside each provider allowlist', () => {
    const store = new SessionCredentialStore();
    const session = store.create();

    expect(() => createProviderClient(session.id, 'gemini', store)).toThrow();
    expect(() => assertModelAllowed('vertex', 'gemini-3.6-flash')).toThrow();
    expect(() => assertModelAllowed('gemini', MODEL_ALLOWLIST.gemini[0])).not.toThrow();
  });
});
