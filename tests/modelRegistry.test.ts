import { describe, expect, it } from 'vitest';
import { AI_MODELS, DEFAULT_MODEL_BY_PROVIDER, migrateModelForProvider } from '../constants';
import { assertModelAllowed, getDefaultModel } from '../server/ai/provider';

describe('provider model registry', () => {
  it('keeps provider defaults and model metadata internally consistent', () => {
    for (const provider of ['gemini', 'vertex'] as const) {
      expect(AI_MODELS[provider].map(model => model.value)).toContain(
        DEFAULT_MODEL_BY_PROVIDER[provider],
      );
      for (const model of AI_MODELS[provider]) {
        expect(['stable', 'preview']).toContain(model.releaseStage);
        expect(typeof model.supportsSearch).toBe('boolean');
      }
    }

    for (const provider of ['gemini', 'vertex'] as const) {
      expect(DEFAULT_MODEL_BY_PROVIDER[provider]).toBe('gemini-3.8-flash');
      expect(getDefaultModel(provider)).toBe('gemini-3.8-flash');
      expect(() => assertModelAllowed(provider, 'gemini-3.8-flash')).not.toThrow();
      expect(() => assertModelAllowed(provider, 'gemini-4-argon')).not.toThrow();
      expect(AI_MODELS[provider].filter(model => model.label.includes('최신'))).toEqual([
        {
          value: 'gemini-4-argon',
          label: 'Gemini 4 Argon (최신)',
          releaseStage: 'stable',
          supportsSearch: true,
        },
      ]);
    }
  });

  it('migrates retired, cross-provider, and current model IDs safely', () => {
    expect(migrateModelForProvider('gemini-3-flash-preview', 'gemini')).toBe('gemini-3.5-flash');
    expect(migrateModelForProvider('gemini-3.1-flash-lite-preview', 'vertex')).toBe(
      'gemini-3.1-flash-lite',
    );
    expect(migrateModelForProvider('gemini-3.6-flash', 'vertex')).toBe(
      DEFAULT_MODEL_BY_PROVIDER.vertex,
    );
    expect(migrateModelForProvider('gemini-3.7-flash', 'vertex')).toBe('gemini-3.7-flash');
    for (const provider of ['gemini', 'vertex'] as const) {
      expect(migrateModelForProvider(undefined, provider)).toBe('gemini-3.8-flash');
      expect(migrateModelForProvider('unknown-model', provider)).toBe('gemini-3.8-flash');
      expect(migrateModelForProvider('gemini-3.8-flash', provider)).toBe('gemini-3.8-flash');
      expect(migrateModelForProvider('gemini-4-argon', provider)).toBe('gemini-4-argon');
    }
  });
});
