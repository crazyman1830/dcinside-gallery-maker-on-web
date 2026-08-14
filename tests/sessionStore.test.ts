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

  it('uses sliding expiration while cleanup preserves active sessions', () => {
    let slidingNow = 0;
    const slidingStore = new SessionCredentialStore(() => slidingNow, 100);
    const slidingSession = slidingStore.create();

    slidingNow = 99;
    expect(slidingStore.get(slidingSession.id)?.id).toBe(slidingSession.id);
    slidingNow = 198;
    expect(slidingStore.get(slidingSession.id)?.id).toBe(slidingSession.id);
    slidingNow = 298;
    expect(slidingStore.get(slidingSession.id)).toBeUndefined();
    expect(slidingStore.size).toBe(0);

    let cleanupNow = 0;
    const cleanupStore = new SessionCredentialStore(() => cleanupNow, 100);
    const expired = cleanupStore.create();
    cleanupNow = 50;
    const active = cleanupStore.create();
    cleanupNow = 99;
    expect(cleanupStore.get(active.id)).toBeDefined();
    cleanupNow = 101;

    expect(cleanupStore.cleanupExpired()).toBe(1);
    expect(cleanupStore.get(expired.id)).toBeUndefined();
    expect(cleanupStore.get(active.id)).toBeDefined();
  });
});
