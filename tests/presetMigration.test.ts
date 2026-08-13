import { describe, expect, it } from 'vitest';
import type { GalleryFormSettings, Preset } from '../types';
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
  isQualityUpgradeUnlocked: true,
  isQualityUpgradeEnabled: false,
  isSearchEnabled: false,
  selectedModel: 'gemini-3.1-flash-lite-preview',
  userNicknameType: 'ANONYMOUS',
  fixedNickname: '',
  userReputation: 50,
};

describe('preset migration', () => {
  it('defaults legacy presets to Gemini without introducing secrets', () => {
    const preset: Preset = { id: 'legacy', name: 'legacy', settings: legacySettings };
    const migrated = migratePreset(preset);

    expect(migrated.settings.selectedProvider).toBe('gemini');
    expect(migrated.settings.selectedModel).toBe('gemini-3.5-flash-lite');
    expect(JSON.stringify(migrated)).not.toMatch(/apiKey|private_key|credentials/i);
  });

  it('excludes every advanced setting when a preset is applied', () => {
    const content = getPresetContentSettings({
      ...legacySettings,
      selectedProvider: 'vertex',
      selectedModel: 'gemini-3.1-pro-preview',
      isSearchEnabled: true,
      isQualityUpgradeUnlocked: false,
      isQualityUpgradeEnabled: true,
    });

    expect(content.topic).toBe('test');
    for (const field of ADVANCED_PRESET_FIELDS) {
      expect(content).not.toHaveProperty(field);
    }
  });
});
