import { describe, expect, it } from 'vitest';
import type { GalleryFormSettings } from '../types';
import {
  ADVANCED_PRESET_FIELDS,
  getPresetContentSettings,
  migratePreset,
} from '../services/presetService';

const legacySettings: GalleryFormSettings = {
  topic: 'test',
  discussionContext: '',
  selectedWorldview: 'NONE',
  customWorldviewText: '',
  selectedWorldviewEra: 'CONTEMPORARY',
  selectedToxicityLevel: 'MEDIUM',
  selectedAnonymousNickRatio: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  isManualGenderRatio: false,
  manualMalePercentage: 50,
  isManualAgeRange: false,
  manualSelectedAgeGroups: [],
  isSearchEnabled: false,
  selectedModel: 'gemini-3.1-flash-lite-preview',
  userNicknameType: 'ANONYMOUS',
  fixedNickname: '',
  userReputation: 50,
};

describe('preset migration', () => {
  it('defaults legacy presets to Gemini without introducing secrets', () => {
    const preset = { id: 'legacy', name: 'legacy', settings: legacySettings };
    const migrated = migratePreset(preset);

    expect(migrated.settings).not.toHaveProperty('selectedProvider');
    expect(migrated.settings).not.toHaveProperty('selectedModel');
    expect(migrated.settings).not.toHaveProperty('isSearchEnabled');
    expect(JSON.stringify(migrated)).not.toMatch(/apiKey|private_key|credentials/i);
  });

  it('excludes every advanced setting when a preset is applied', () => {
    const content = getPresetContentSettings({
      ...legacySettings,
      selectedProvider: 'vertex',
      selectedModel: 'gemini-3.1-pro-preview',
      isSearchEnabled: true,
    });

    expect(content.topic).toBe('test');
    for (const field of ADVANCED_PRESET_FIELDS) {
      expect(content).not.toHaveProperty(field);
    }
  });
});
