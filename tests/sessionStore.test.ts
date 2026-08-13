import { describe, expect, it } from 'vitest';
import { SessionCredentialStore } from '../server/sessionStore';

describe('SessionCredentialStore', () => {
  it('isolates provider credentials between sessions and never exposes secrets in status', () => {
    const store = new SessionCredentialStore(() => 1_000, 10_000);
    const first = store.create();
    const second = store.create();

    store.setGemini(first.id, 'first-secret');
    store.setGemini(second.id, 'second-secret');
    store.setVertex(first.id, {
      authMode: 'adc',
      projectId: 'sample-project-123',
      location: 'global',
    });

    expect(store.get(first.id)?.gemini?.apiKey).toBe('first-secret');
    expect(store.get(second.id)?.gemini?.apiKey).toBe('second-secret');
    expect(store.status(first.id)).toEqual({
      providers: {
        gemini: { configured: true },
        vertex: {
          configured: true,
          authMode: 'adc',
          projectId: 'sample-project-123',
          location: 'global',
        },
      },
    });
    expect(JSON.stringify(store.status(first.id))).not.toContain('first-secret');
    expect(store.status(second.id).providers.vertex.configured).toBe(false);
  });

  it('deletes only the requested provider from the requested session', () => {
    const store = new SessionCredentialStore(() => 1_000, 10_000);
    const first = store.create();
    const second = store.create();
    store.setGemini(first.id, 'first-secret');
    store.setVertex(first.id, {
      authMode: 'adc',
      projectId: 'sample-project-123',
      location: 'global',
    });
    store.setGemini(second.id, 'second-secret');

    expect(store.deleteProvider(first.id, 'gemini')).toBe(true);
    expect(store.deleteProvider(first.id, 'gemini')).toBe(false);
    expect(store.status(first.id).providers).toEqual({
      gemini: { configured: false },
      vertex: {
        configured: true,
        authMode: 'adc',
        projectId: 'sample-project-123',
        location: 'global',
      },
    });
    expect(store.status(second.id).providers.gemini.configured).toBe(true);
  });

  it('uses sliding expiration and removes sessions at the TTL boundary', () => {
    let now = 0;
    const store = new SessionCredentialStore(() => now, 100);
    const session = store.create();

    now = 99;
    expect(store.get(session.id)?.id).toBe(session.id);
    now = 198;
    expect(store.get(session.id)?.id).toBe(session.id);
    now = 298;
    expect(store.get(session.id)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('cleans up all expired sessions without removing active sessions', () => {
    let now = 0;
    const store = new SessionCredentialStore(() => now, 100);
    const expired = store.create();
    now = 50;
    const active = store.create();
    now = 99;
    expect(store.get(active.id)).toBeDefined();
    now = 101;

    expect(store.cleanupExpired()).toBe(1);
    expect(store.get(expired.id)).toBeUndefined();
    expect(store.get(active.id)).toBeDefined();
  });
});
