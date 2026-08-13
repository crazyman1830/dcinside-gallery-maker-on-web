import { describe, expect, it } from 'vitest';
import {
  AI_MODELS,
  DEFAULT_MODEL_BY_PROVIDER,
  migrateModelForProvider,
} from '../constants';

describe('provider model registry', () => {
  it('uses an allowlisted default for each provider', () => {
    for (const provider of ['gemini', 'vertex'] as const) {
      expect(AI_MODELS[provider].map(model => model.value))
        .toContain(DEFAULT_MODEL_BY_PROVIDER[provider]);
    }
  });

  it('migrates retired preview model ids', () => {
    expect(migrateModelForProvider('gemini-3-flash-preview', 'gemini'))
      .toBe('gemini-3.5-flash');
    expect(migrateModelForProvider('gemini-3.1-flash-lite-preview', 'vertex'))
      .toBe('gemini-3.1-flash-lite');
  });

  it('falls back when a model belongs only to the other provider', () => {
    expect(migrateModelForProvider('gemini-3.6-flash', 'vertex'))
      .toBe(DEFAULT_MODEL_BY_PROVIDER.vertex);
  });
});
