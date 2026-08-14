import type { GalleryFormSettings, Preset, PresetContentSettings } from '../types';

export type { PresetContentSettings } from '../types';

export const PRESET_STORAGE_KEY = 'dcgm.presets.v2';
export const LEGACY_PRESET_STORAGE_KEY = 'user_presets';

interface StoredPresetsV2 {
  version: 2;
  savedAt: string;
  presets: Preset[];
}

let inMemoryUserPresets: Preset[] | null = null;
let presetStorageWarning: string | null = null;

export const getPresetStorageWarning = (): string | null => presetStorageWarning;

export const ADVANCED_PRESET_FIELDS = [
  'isSearchEnabled',
  'selectedProvider',
  'selectedModel',
] as const satisfies ReadonlyArray<keyof GalleryFormSettings>;

/**
 * Presets describe the gallery scenario only. Runtime/provider choices in the
 * advanced section belong to the current session and must survive preset loads.
 */
export const getPresetContentSettings = (
  settings: GalleryFormSettings | PresetContentSettings,
): PresetContentSettings => {
  const contentSettings = { ...settings } as Partial<GalleryFormSettings>;
  for (const field of ADVANCED_PRESET_FIELDS) delete contentSettings[field];
  return contentSettings as PresetContentSettings;
};

export const migratePreset = (
  preset: Omit<Preset, 'settings'> & {
    settings: GalleryFormSettings | PresetContentSettings;
  },
): Preset => ({
  ...preset,
  settings: getPresetContentSettings(preset.settings),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizePreset = (value: unknown): Preset | null => {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  if (
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.name !== 'string' ||
    !value.name.trim()
  )
    return null;
  const raw = value.settings;
  const requiredStrings = [
    'topic',
    'discussionContext',
    'selectedWorldview',
    'customWorldviewText',
    'selectedWorldviewEra',
    'selectedToxicityLevel',
    'selectedAnonymousNickRatio',
    'userSpecies',
    'userAffiliation',
    'userNicknameType',
    'fixedNickname',
  ] as const;
  if (requiredStrings.some(field => typeof raw[field] !== 'string')) return null;
  if (
    typeof raw.isManualGenderRatio !== 'boolean' ||
    typeof raw.isManualAgeRange !== 'boolean' ||
    !isFiniteNumber(raw.manualMalePercentage) ||
    !isFiniteNumber(raw.userReputation) ||
    !Array.isArray(raw.manualSelectedAgeGroups) ||
    !raw.manualSelectedAgeGroups.every(group => typeof group === 'string') ||
    (raw.userNicknameType !== 'FIXED' && raw.userNicknameType !== 'ANONYMOUS')
  )
    return null;

  const strings = raw as Record<(typeof requiredStrings)[number], string>;

  const settings: PresetContentSettings = {
    topic: strings.topic.slice(0, 20),
    discussionContext: strings.discussionContext.slice(0, 500),
    selectedWorldview:
      strings.selectedWorldview === 'CONTEMPORARY' ? 'NONE' : strings.selectedWorldview,
    customWorldviewText: strings.customWorldviewText.slice(0, 500),
    selectedWorldviewEra: strings.selectedWorldviewEra,
    selectedToxicityLevel: strings.selectedToxicityLevel,
    selectedAnonymousNickRatio: strings.selectedAnonymousNickRatio,
    userSpecies: strings.userSpecies.slice(0, 30),
    userAffiliation: strings.userAffiliation.slice(0, 30),
    isManualGenderRatio: raw.isManualGenderRatio,
    manualMalePercentage: Math.max(0, Math.min(100, Math.round(raw.manualMalePercentage))),
    isManualAgeRange: raw.isManualAgeRange,
    manualSelectedAgeGroups: [...new Set(raw.manualSelectedAgeGroups)].slice(0, 7),
    userNicknameType: raw.userNicknameType,
    fixedNickname: strings.fixedNickname.slice(0, 10),
    userReputation: Math.max(0, Math.min(100, Math.round(raw.userReputation))),
  };
  return {
    id: value.id.slice(0, 128),
    name: value.name.trim().slice(0, 80),
    settings,
  };
};

const normalizePresetArray = (value: unknown): Preset[] =>
  Array.isArray(value)
    ? value.map(normalizePreset).filter((preset): preset is Preset => preset !== null)
    : [];

const readJson = (key: string): unknown => {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? null : (JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
};

const persistUserPresets = (presets: Preset[]): boolean => {
  const payload: StoredPresetsV2 = {
    version: 2,
    savedAt: new Date().toISOString(),
    presets,
  };
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_PRESET_STORAGE_KEY);
    presetStorageWarning = null;
    return true;
  } catch {
    presetStorageWarning = '브라우저 저장 공간이 부족해 프리셋이 현재 실행에만 보관됩니다.';
    return false;
  }
};

const loadUserPresets = (): Preset[] => {
  if (inMemoryUserPresets) return inMemoryUserPresets;
  const storedV2 = readJson(PRESET_STORAGE_KEY);
  if (isRecord(storedV2) && storedV2.version === 2) {
    inMemoryUserPresets = normalizePresetArray(storedV2.presets);
    return inMemoryUserPresets;
  }
  const legacy = normalizePresetArray(readJson(LEGACY_PRESET_STORAGE_KEY));
  inMemoryUserPresets = legacy;
  if (legacy.length > 0) persistUserPresets(legacy);
  return inMemoryUserPresets;
};

// --- Example Presets Data ---
const EXAMPLE_PRESETS: Preset[] = [
  {
    id: 'preset-example-macho',
    name: '[예시] 현대 - 상남자 갤러리',
    settings: {
      topic: '상남자 특',
      discussionContext:
        '진정한 상남자의 행동양식, 여자들이 반하는 상남자 마인드 등 얼토당토않은 밈 공유',
      selectedWorldview: 'NONE',
      customWorldviewText: '',
      selectedWorldviewEra: 'CONTEMPORARY',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '인간',
      userAffiliation: '알파메일 호소인',
      isManualGenderRatio: true,
      manualMalePercentage: 100,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-earth',
    name: '[예시] 지구 - 탈모 갤러리',
    settings: {
      topic: '탈모',
      discussionContext: '본인의 탈모 경험공유 및 탈모약, 샴푸 등의 솔루션 추천',
      selectedWorldview: 'NONE',
      customWorldviewText: '',
      selectedWorldviewEra: 'CONTEMPORARY',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '인간',
      userAffiliation: '',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-murim',
    name: '[예시] 무협 - 무공 갤러리',
    settings: {
      topic: '무공',
      discussionContext: '가장 배우고 싶은 무공에 대한 논쟁',
      selectedWorldview: 'MURIM',
      customWorldviewText: '',
      selectedWorldviewEra: 'ANCIENT',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '인간',
      userAffiliation: '',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-fantasy',
    name: '[예시] 판타지 - 마법 갤러리',
    settings: {
      topic: '마법',
      discussionContext: '가장 쓸모있는 생활마법에 대한 논쟁',
      selectedWorldview: 'FANTASY',
      customWorldviewText: '',
      selectedWorldviewEra: 'MEDIEVAL',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '엘프, 드워프, 인간 등 다양함',
      userAffiliation: '',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-prehistoric',
    name: '[예시] 선사시대 - 사냥 갤러리',
    settings: {
      topic: '사냥',
      discussionContext: '최근 부족 주변에 나타난 매머드 무리를 사냥하는 방법에 대한 토론',
      selectedWorldview: 'NONE',
      customWorldviewText: '',
      selectedWorldviewEra: 'PREHISTORIC',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '호모 사피엔스',
      userAffiliation: '',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-fantasy-cooking',
    name: '[예시] 판타지 - 몬스터 요리 갤러리',
    settings: {
      topic: '몬스터 요리',
      discussionContext:
        '드래곤 고기 굽는 법, 슬라임 젤리 레시피 등 판타지 몬스터 식재료 요리법 공유',
      selectedWorldview: 'FANTASY',
      customWorldviewText: '',
      selectedWorldviewEra: 'MEDIEVAL',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '몬스터 식도락가',
      userAffiliation: '모험가 길드 요리부',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-scifi-space',
    name: '[예시] SF - 우주 무역 갤러리',
    settings: {
      topic: '우주 무역',
      discussionContext: '안드로메다 은하 특산품 시세 급락 및 해적 출몰 구역 정보 공유',
      selectedWorldview: 'NONE',
      customWorldviewText: '',
      selectedWorldviewEra: 'FAR_FUTURE',
      selectedToxicityLevel: 'MILD',
      selectedAnonymousNickRatio: 'HIGH_ANON',
      userSpecies: '테란, 프로토스, 외계인 등',
      userAffiliation: '은하 상선 연합',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-stock-trend',
    name: '[예시] 현대 - 실시간 주식 갤러리',
    settings: {
      topic: '주식 투자',
      discussionContext:
        '최신 경제 뉴스, 기업 실적 발표, 금리 인상 등 실시간 트렌드를 반영한 종목 토론 및 수익률 자랑/한탄',
      selectedWorldview: 'NONE',
      customWorldviewText: '',
      selectedWorldviewEra: 'CONTEMPORARY',
      selectedToxicityLevel: 'SPICY',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '인간',
      userAffiliation: '개미투자자',
      isManualGenderRatio: false,
      manualMalePercentage: 70,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-historical-joseon',
    name: '[예시] 조선시대 - 과거 시험 갤러리',
    settings: {
      topic: '과거 시험',
      discussionContext: '이번 식년시 시제 난이도 논쟁 및 낙방자들의 한탄',
      selectedWorldview: 'NONE',
      customWorldviewText: '',
      selectedWorldviewEra: 'MEDIEVAL',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'LOW_ANON',
      userSpecies: '인간',
      userAffiliation: '성균관 유생',
      isManualGenderRatio: true,
      manualMalePercentage: 90,
      isManualAgeRange: false,
      manualSelectedAgeGroups: [],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
  {
    id: 'preset-example-cyberpunk',
    name: '[예시] 사이버펑크 - 임플란트 갤러리',
    settings: {
      topic: '임플란트',
      discussionContext: '최신형 안구 임플란트 부작용 사례 및 불법 개조 펌웨어 공유',
      selectedWorldview: 'CUSTOM',
      customWorldviewText:
        '초거대 기업이 지배하는 2077년의 네온 도시. 인구의 80%가 신체를 기계로 개조했으며, 해커와 용병들이 뒷골목을 지배한다.',
      selectedWorldviewEra: 'NEAR_FUTURE',
      selectedToxicityLevel: 'MEDIUM',
      selectedAnonymousNickRatio: 'BALANCED',
      userSpecies: '사이보그, 인간',
      userAffiliation: '나이트 시티 거주민',
      isManualGenderRatio: false,
      manualMalePercentage: 50,
      isManualAgeRange: true,
      manualSelectedAgeGroups: ['TWENTIES', 'THIRTIES'],
      userNicknameType: 'ANONYMOUS',
      fixedNickname: '',
      userReputation: 50,
    },
  },
];

export const getPresets = (): Preset[] => {
  return [...EXAMPLE_PRESETS.map(migratePreset), ...loadUserPresets()];
};

export const saveUserPreset = (name: string, settings: GalleryFormSettings): Preset[] => {
  const newPreset: Preset = {
    id: `preset-user-${Date.now()}`,
    name: name,
    settings: getPresetContentSettings(settings),
  };

  const normalized = normalizePreset(newPreset);
  if (!normalized) return getPresets();
  const userPresets = [...loadUserPresets(), normalized];
  inMemoryUserPresets = userPresets;
  persistUserPresets(userPresets);
  return [...EXAMPLE_PRESETS.map(migratePreset), ...userPresets];
};

export const deleteUserPreset = (id: string): Preset[] => {
  // Can only delete user presets
  if (id.startsWith('preset-example-')) return getPresets();

  const userPresets = loadUserPresets().filter(preset => preset.id !== id);
  inMemoryUserPresets = userPresets;
  persistUserPresets(userPresets);
  return [...EXAMPLE_PRESETS.map(migratePreset), ...userPresets];
};
