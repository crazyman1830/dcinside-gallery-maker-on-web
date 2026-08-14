// --- Form Option Values & Labels ---

export const CUSTOM_WORLDVIEW_VALUE = 'CUSTOM';
export const MAX_CUSTOM_WORLDVIEW_LENGTH = 500;

export const WORLDVIEW_OPTIONS = [
  { value: 'NONE', label: '지구 (기본)' },
  { value: 'MURIM', label: '무협 (Martial Arts)' },
  { value: 'FANTASY', label: '판타지 (Fantasy)' },
  { value: CUSTOM_WORLDVIEW_VALUE, label: '직접 입력...' },
];

export const WORLDVIEW_ERA_OPTIONS = [
  { value: 'PREHISTORIC', label: '선사시대' },
  { value: 'ANCIENT', label: '고대시대' },
  { value: 'MEDIEVAL', label: '중세시대' },
  { value: 'EARLY_MODERN', label: '근대시대' },
  { value: 'CONTEMPORARY', label: '현대시대 (기본)' },
  { value: 'NEAR_FUTURE', label: '근미래시대' },
  { value: 'FAR_FUTURE', label: '미래시대' },
];
export const DEFAULT_WORLDVIEW_ERA = 'CONTEMPORARY';
export const WORLDVIEW_ERA_NOT_APPLICABLE = '';

export const TOXICITY_LEVEL_OPTIONS = [
  { value: 'MILD', label: '🌶️ 순한맛 (Mild)', nameForTitle: '순한맛' },
  { value: 'MEDIUM', label: '🌶️🌶️ 보통맛 (Medium)', nameForTitle: '보통맛' },
  { value: 'SPICY', label: '🌶️🌶️🌶️ 매운맛 (Spicy)', nameForTitle: '매운맛' },
];
export const DEFAULT_TOXICITY_LEVEL = 'MEDIUM';

export const ANONYMOUS_NICK_RATIO_OPTIONS = [
  {
    value: 'LOW_ANON',
    label: '고정닉 위주 (유동닉 약 20%)',
    descriptionForPrompt:
      "The vast majority (around 80%) of post authors and comment authors should be '고정닉' (Fixed Nicknames). The remaining (around 20%) should be '유동닉' (Anonymous/Fluid Nicknames).",
  },
  {
    value: 'BALANCED',
    label: '균형 (유동닉/고정닉 약 50%)',
    descriptionForPrompt:
      "Post authors and comment authors should be a mix of '고정닉' (Fixed Nicknames) and '유동닉' (Anonymous/Fluid Nicknames), with roughly 50% of each type.",
  },
  {
    value: 'HIGH_ANON',
    label: '유동닉 위주 (고정닉 약 20%)',
    descriptionForPrompt:
      "The vast majority (around 80%) of post authors and comment authors should be '유동닉' (Anonymous/Fluid Nicknames). The remaining (around 20%) should be '고정닉' (Fixed Nicknames).",
  },
];
export const DEFAULT_ANONYMOUS_NICK_RATIO = 'BALANCED';

export const MAX_USER_SPECIES_LENGTH = 30;
export const MAX_USER_AFFILIATION_LENGTH = 30;

export const GENDER_RATIO_AUTO_ID = 'AUTO';
export const AGE_RANGE_AUTO_ID = 'AUTO';

export const AGE_RANGE_OPTIONS = [
  {
    value: 'ALL_AGES',
    label: '전체',
    descriptionForPrompt:
      'Users from all age groups participate. Content and discussions should be generally accessible or reflect a broad range of age-related interests, as appropriate for the worldview.',
  },
  {
    value: 'TEENS',
    label: '10대',
    descriptionForPrompt:
      'The primary user base is teenagers (10-19 years old). Language will include youth slang, memes, and concerns relevant to this age group (school, early relationships, trends, identity), all adapted to the worldview/era.',
  },
  {
    value: 'TWENTIES',
    label: '20대',
    descriptionForPrompt:
      'The primary user base is in their twenties. Topics may include higher education, early career, independence, relationships, and popular culture relevant to this demographic, adapted to the worldview/era.',
  },
  {
    value: 'THIRTIES',
    label: '30대',
    descriptionForPrompt:
      'The primary user base is in their thirties. Discussions might focus on career development, family life, financial stability, and hobbies, all within the context of the worldview/era.',
  },
  {
    value: 'FORTIES',
    label: '40대',
    descriptionForPrompt:
      'The primary user base is in their forties. Themes could include mid-career changes, established family life, health and wellness, and reflections on life, adapted to the worldview/era.',
  },
  {
    value: 'FIFTIES',
    label: '50대',
    descriptionForPrompt:
      'The primary user base is in their fifties. Topics may involve pre-retirement planning, legacy, mature hobbies, and health, interpreted through the lens of the worldview/era.',
  },
  {
    value: 'SIXTIES',
    label: '60대',
    descriptionForPrompt:
      'The primary user base is in their sixties. Discussions could revolve around retirement, grandchildren, health, and lifelong interests, all consistent with the worldview/era.',
  },
  {
    value: 'SEVENTIES_PLUS',
    label: '70대 이상',
    descriptionForPrompt:
      'The primary user base is seventy or older. Themes might include wisdom, legacy, health challenges, and reflections on a long life, all adapted to the worldview/era.',
  },
];
export const DEFAULT_AGE_RANGE = 'ALL_AGES';
