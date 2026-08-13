
import { Preset, GalleryFormSettings } from '../types';
import {
  DEFAULT_AI_PROVIDER,
  GEMINI_MODEL_3_PRO,
  migrateModelForProvider,
} from '../constants';

const STORAGE_KEY = 'user_presets';

export const ADVANCED_PRESET_FIELDS = [
  'isQualityUpgradeUnlocked',
  'isQualityUpgradeEnabled',
  'isSearchEnabled',
  'selectedProvider',
  'selectedModel',
] as const satisfies ReadonlyArray<keyof GalleryFormSettings>;

type AdvancedPresetField = typeof ADVANCED_PRESET_FIELDS[number];
export type PresetContentSettings = Omit<GalleryFormSettings, AdvancedPresetField>;

/**
 * Presets describe the gallery scenario only. Runtime/provider choices in the
 * advanced section belong to the current session and must survive preset loads.
 */
export const getPresetContentSettings = (
  settings: GalleryFormSettings,
): PresetContentSettings => {
  const contentSettings = { ...settings } as Partial<GalleryFormSettings>;
  for (const field of ADVANCED_PRESET_FIELDS) delete contentSettings[field];
  return contentSettings as PresetContentSettings;
};

export const migratePreset = (preset: Preset): Preset => {
  const selectedProvider = preset.settings.selectedProvider ?? DEFAULT_AI_PROVIDER;
  return {
    ...preset,
    settings: {
      ...preset.settings,
      selectedProvider,
      selectedModel: migrateModelForProvider(preset.settings.selectedModel, selectedProvider),
    },
  };
};

// --- Example Presets Data ---
const EXAMPLE_PRESETS: Preset[] = [
  {
    "id": "preset-example-macho",
    "name": "[예시] 현대 - 상남자 갤러리",
    "settings": {
      "topic": "상남자 특",
      "discussionContext": "진정한 상남자의 행동양식, 여자들이 반하는 상남자 마인드 등 얼토당토않은 밈 공유",
      "selectedWorldview": "NONE",
      "customWorldviewText": "",
      "selectedWorldviewEra": "CONTEMPORARY",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "인간",
      "userAffiliation": "알파메일 호소인",
      "isManualGenderRatio": true,
      "manualMalePercentage": 100,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-earth",
    "name": "[예시] 지구 - 탈모 갤러리",
    "settings": {
      "topic": "탈모",
      "discussionContext": "본인의 탈모 경험공유 및 탈모약, 샴푸 등의 솔루션 추천",
      "selectedWorldview": "NONE",
      "customWorldviewText": "",
      "selectedWorldviewEra": "CONTEMPORARY",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "인간",
      "userAffiliation": "",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-murim",
    "name": "[예시] 무협 - 무공 갤러리",
    "settings": {
      "topic": "무공",
      "discussionContext": "가장 배우고 싶은 무공에 대한 논쟁",
      "selectedWorldview": "MURIM",
      "customWorldviewText": "",
      "selectedWorldviewEra": "ANCIENT",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "인간",
      "userAffiliation": "",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-fantasy",
    "name": "[예시] 판타지 - 마법 갤러리",
    "settings": {
      "topic": "마법",
      "discussionContext": "가장 쓸모있는 생활마법에 대한 논쟁",
      "selectedWorldview": "FANTASY",
      "customWorldviewText": "",
      "selectedWorldviewEra": "MEDIEVAL",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "엘프, 드워프, 인간 등 다양함",
      "userAffiliation": "",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-prehistoric",
    "name": "[예시] 선사시대 - 사냥 갤러리",
    "settings": {
      "topic": "사냥",
      "discussionContext": "최근 부족 주변에 나타난 매머드 무리를 사냥하는 방법에 대한 토론",
      "selectedWorldview": "NONE",
      "customWorldviewText": "",
      "selectedWorldviewEra": "PREHISTORIC",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "호모 사피엔스",
      "userAffiliation": "",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-fantasy-cooking",
    "name": "[예시] 판타지 - 몬스터 요리 갤러리",
    "settings": {
      "topic": "몬스터 요리",
      "discussionContext": "드래곤 고기 굽는 법, 슬라임 젤리 레시피 등 판타지 몬스터 식재료 요리법 공유",
      "selectedWorldview": "FANTASY",
      "customWorldviewText": "",
      "selectedWorldviewEra": "MEDIEVAL",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "몬스터 식도락가",
      "userAffiliation": "모험가 길드 요리부",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-scifi-space",
    "name": "[예시] SF - 우주 무역 갤러리",
    "settings": {
      "topic": "우주 무역",
      "discussionContext": "안드로메다 은하 특산품 시세 급락 및 해적 출몰 구역 정보 공유",
      "selectedWorldview": "NONE",
      "customWorldviewText": "",
      "selectedWorldviewEra": "FAR_FUTURE",
      "selectedToxicityLevel": "MILD",
      "selectedAnonymousNickRatio": "HIGH_ANON",
      "userSpecies": "테란, 프로토스, 외계인 등",
      "userAffiliation": "은하 상선 연합",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-stock-trend",
    "name": "[예시] 현대 - 실시간 주식 갤러리",
    "settings": {
      "topic": "주식 투자",
      "discussionContext": "최신 경제 뉴스, 기업 실적 발표, 금리 인상 등 실시간 트렌드를 반영한 종목 토론 및 수익률 자랑/한탄",
      "selectedWorldview": "CONTEMPORARY",
      "customWorldviewText": "",
      "selectedWorldviewEra": "CONTEMPORARY",
      "selectedToxicityLevel": "SPICY",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "인간",
      "userAffiliation": "개미투자자",
      "isManualGenderRatio": false,
      "manualMalePercentage": 70,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": true,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-historical-joseon",
    "name": "[예시] 조선시대 - 과거 시험 갤러리",
    "settings": {
      "topic": "과거 시험",
      "discussionContext": "이번 식년시 시제 난이도 논쟁 및 낙방자들의 한탄",
      "selectedWorldview": "NONE",
      "customWorldviewText": "",
      "selectedWorldviewEra": "MEDIEVAL",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "LOW_ANON",
      "userSpecies": "인간",
      "userAffiliation": "성균관 유생",
      "isManualGenderRatio": true,
      "manualMalePercentage": 90,
      "isManualAgeRange": false,
      "manualSelectedAgeGroups": [],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  },
  {
    "id": "preset-example-cyberpunk",
    "name": "[예시] 사이버펑크 - 임플란트 갤러리",
    "settings": {
      "topic": "임플란트",
      "discussionContext": "최신형 안구 임플란트 부작용 사례 및 불법 개조 펌웨어 공유",
      "selectedWorldview": "CUSTOM",
      "customWorldviewText": "초거대 기업이 지배하는 2077년의 네온 도시. 인구의 80%가 신체를 기계로 개조했으며, 해커와 용병들이 뒷골목을 지배한다.",
      "selectedWorldviewEra": "NEAR_FUTURE",
      "selectedToxicityLevel": "MEDIUM",
      "selectedAnonymousNickRatio": "BALANCED",
      "userSpecies": "사이보그, 인간",
      "userAffiliation": "나이트 시티 거주민",
      "isManualGenderRatio": false,
      "manualMalePercentage": 50,
      "isManualAgeRange": true,
      "manualSelectedAgeGroups": ["TWENTIES", "THIRTIES"],
      "isQualityUpgradeUnlocked": true,
      "isQualityUpgradeEnabled": false,
      "isSearchEnabled": false,
      "selectedModel": GEMINI_MODEL_3_PRO,
      "userNicknameType": "ANONYMOUS",
      "fixedNickname": "",
      "userReputation": 50
    }
  }
];

export const getPresets = (): Preset[] => {
  let userPresets: Preset[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      userPresets = JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load user presets:", error);
  }
  return [...EXAMPLE_PRESETS, ...userPresets].map(migratePreset);
};

export const saveUserPreset = (name: string, settings: GalleryFormSettings): Preset[] => {
  const newPreset: Preset = {
    id: `preset-user-${Date.now()}`,
    name: name,
    settings: settings
  };

  let userPresets: Preset[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      userPresets = JSON.parse(stored);
    }
  } catch (e) { /* ignore */ }

  userPresets.push(newPreset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
  
  return [...EXAMPLE_PRESETS, ...userPresets].map(migratePreset);
};

export const deleteUserPreset = (id: string): Preset[] => {
  // Can only delete user presets
  if (id.startsWith('preset-example-')) return getPresets();

  let userPresets: Preset[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      userPresets = JSON.parse(stored);
    }
    userPresets = userPresets.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
  } catch (e) {
    console.error("Failed to delete preset:", e);
  }
  
  return [...EXAMPLE_PRESETS, ...userPresets].map(migratePreset);
};
