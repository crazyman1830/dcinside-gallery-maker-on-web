import { describe, expect, it } from 'vitest';
import { migrateGalleryContext } from '../hooks/useGalleryStorage';

const legacyContext = {
  topic: 'legacy',
  discussionContext: '',
  worldviewValue: 'NONE',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedModel: 'gemini-3-flash-preview',
  useSearch: false,
};

describe('stored gallery context migration', () => {
  it('defaults legacy contexts to Gemini and migrates retired models', () => {
    const migrated = migrateGalleryContext(legacyContext);
    expect(migrated?.selectedProvider).toBe('gemini');
    expect(migrated?.selectedModel).toBe('gemini-3.5-flash');
  });

  it('rejects malformed stored contexts', () => {
    expect(migrateGalleryContext({ selectedModel: 'gemini-3.5-flash' })).toBeNull();
  });
});
