import { describe, expect, it } from 'vitest';
import { AI_MODELS, DEFAULT_MODEL_BY_PROVIDER, migrateModelForProvider } from '../constants';

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

    expect(DEFAULT_MODEL_BY_PROVIDER.vertex).toBe('gemini-3.7-flash');
    expect(AI_MODELS.vertex).toContainEqual({
      value: 'gemini-3.7-flash',
      label: 'Gemini 3.7 Flash (기본·최신)',
      releaseStage: 'stable',
      supportsSearch: true,
    });
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
  });
});
