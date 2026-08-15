import { describe, expect, it, vi } from 'vitest';
import { createWorldlineId, WORLDLINE_ID_PATTERN } from '../utils/worldline';

describe('worldline identifiers', () => {
  it('creates distinct 48-bit identifiers in the public format', () => {
    const identifiers = Array.from({ length: 32 }, () => createWorldlineId());

    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(identifiers.every(identifier => WORLDLINE_ID_PATTERN.test(identifier))).toBe(true);
  });

  it('fails closed when a cryptographically secure generator is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => createWorldlineId()).toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
