import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GalleryFormSettings } from '../types';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError');
    this.values.set(key, value);
  }
}

const settings: GalleryFormSettings = {
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
  selectedProvider: 'gemini',
  selectedModel: 'gemini-3.5-flash',
  userNicknameType: 'ANONYMOUS',
  fixedNickname: '',
  userReputation: 50,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('preset V2 storage', () => {
  it.each(['{}', '[{}]', 'null'])('ignores malformed legacy value %s', async stored => {
    const storage = new MemoryStorage();
    storage.setItem('user_presets', stored);
    vi.stubGlobal('localStorage', storage);
    const { getPresets } = await import('../services/presetService');

    expect(() => getPresets()).not.toThrow();
    expect(getPresets().every(preset => preset.id.startsWith('preset-example-'))).toBe(true);
  });

  it('migrates valid user presets to the versioned key', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'user_presets',
      JSON.stringify([{ id: 'preset-user-1', name: 'mine', settings }]),
    );
    vi.stubGlobal('localStorage', storage);
    const { getPresets, PRESET_STORAGE_KEY } = await import('../services/presetService');

    expect(getPresets().some(preset => preset.id === 'preset-user-1')).toBe(true);
    expect(JSON.parse(storage.getItem(PRESET_STORAGE_KEY)!).version).toBe(2);
    expect(storage.getItem('user_presets')).toBeNull();
  });

  it('retains a newly saved preset in memory when quota is exceeded', async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = await import('../services/presetService');
    service.getPresets();
    storage.failWrites = true;

    const result = service.saveUserPreset('temporary', settings);
    expect(result.some(preset => preset.name === 'temporary')).toBe(true);
    expect(service.getPresetStorageWarning()).toMatch(/저장 공간/);
  });

  it('loads V2 data, strips advanced fields, and deletes only user presets', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'dcgm.presets.v2',
      JSON.stringify({
        version: 2,
        savedAt: '2026-08-14T00:00:00.000Z',
        presets: [{ id: 'preset-user-v2', name: 'saved', settings }],
      }),
    );
    vi.stubGlobal('localStorage', storage);
    const service = await import('../services/presetService');

    const loaded = service.getPresets();
    const userPreset = loaded.find(preset => preset.id === 'preset-user-v2');
    expect(userPreset?.settings).not.toHaveProperty('selectedProvider');
    expect(userPreset?.settings).not.toHaveProperty('selectedModel');
    expect(userPreset?.settings).not.toHaveProperty('isSearchEnabled');

    const builtinId = loaded.find(preset => preset.id.startsWith('preset-example-'))!.id;
    expect(service.deleteUserPreset(builtinId).some(preset => preset.id === builtinId)).toBe(true);
    expect(
      service.deleteUserPreset('preset-user-v2').some(preset => preset.id === 'preset-user-v2'),
    ).toBe(false);
  });

  it('persists a valid new preset and ignores invalid runtime input', async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = await import('../services/presetService');

    const saved = service.saveUserPreset(' mine ', {
      ...settings,
      selectedProvider: 'vertex',
      selectedModel: 'gemini-3.1-pro-preview',
      isSearchEnabled: true,
    });
    const created = saved.find(preset => preset.name === 'mine');
    expect(created?.settings).not.toHaveProperty('selectedProvider');
    expect(service.getPresetStorageWarning()).toBeNull();

    const before = service.getPresets().length;
    const invalid = service.saveUserPreset('', { ...settings, topic: 42 } as never);
    expect(invalid).toHaveLength(before);
  });
});
