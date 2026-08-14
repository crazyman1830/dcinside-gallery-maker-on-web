import type { AiProvider } from './types';

// --- Models ---
export const DEFAULT_AI_PROVIDER: AiProvider = 'gemini';

// Search grounding remains capability metadata on models, but the v0.1.0 UI
// stays closed until a dedicated verbatim, non-enriched grounded-result
// pipeline is reviewed and shipped.
export const SEARCH_GROUNDING_RELEASE_ENABLED = false;

export interface AiModelDefinition {
  value: string;
  label: string;
  releaseStage: 'stable' | 'preview';
  supportsSearch: boolean;
}

export const AI_MODELS: Record<AiProvider, ReadonlyArray<AiModelDefinition>> = {
  gemini: [
    {
      value: 'gemini-3.6-flash',
      label: 'Gemini 3.6 Flash (최신)',
      releaseStage: 'stable',
      supportsSearch: true,
    },
    {
      value: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash (추천)',
      releaseStage: 'stable',
      supportsSearch: true,
    },
    {
      value: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite (빠르고 경제적)',
      releaseStage: 'stable',
      supportsSearch: true,
    },
    {
      value: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview (고성능)',
      releaseStage: 'preview',
      supportsSearch: true,
    },
  ],
  vertex: [
    {
      value: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash (추천)',
      releaseStage: 'stable',
      supportsSearch: true,
    },
    {
      value: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite (빠르고 경제적)',
      releaseStage: 'stable',
      supportsSearch: true,
    },
    {
      value: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash-Lite (저비용)',
      releaseStage: 'stable',
      supportsSearch: true,
    },
    {
      value: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview (고성능)',
      releaseStage: 'preview',
      supportsSearch: true,
    },
  ],
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  gemini: 'gemini-3.5-flash',
  vertex: 'gemini-3.5-flash',
};

export const EVALUATION_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  gemini: 'gemini-3.5-flash-lite',
  vertex: 'gemini-3.5-flash-lite',
};

export const migrateModelForProvider = (
  model: string | undefined,
  provider: AiProvider,
): string => {
  const replacements: Record<string, string> = {
    'gemini-3-flash-preview': 'gemini-3.5-flash',
    'gemini-3.1-flash-lite-preview':
      provider === 'vertex' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash-lite',
  };
  const migrated = model ? (replacements[model] ?? model) : DEFAULT_MODEL_BY_PROVIDER[provider];
  return AI_MODELS[provider].some(option => option.value === migrated)
    ? migrated
    : DEFAULT_MODEL_BY_PROVIDER[provider];
};

// --- Gallery Config ---
export const DEFAULT_ERROR_MESSAGE =
  '응답을 처리하는 중 오류가 발생했습니다. 재시도를 해주시고, 지속적으로 발생 시, 개발자에게 알려주시면 감사하겠습니다.';
export const NUMBER_OF_POSTS = 5;
export const MIN_COMMENTS_PER_POST = 5;
export const MAX_COMMENTS_PER_POST = 10;
export const MIN_COMMENTS_PER_BEST_POST = 10;
export const MAX_COMMENTS_PER_BEST_POST = 20;

export const MAX_TOTAL_COMMENTS_PER_POST = 30;
export const MIN_AI_FOLLOW_UP_COMMENTS = 5;
export const MAX_AI_FOLLOW_UP_COMMENTS = 10;
export const USER_COMMENT_AUTHOR = '나';
export const MAX_COMMENT_AUTHOR_LENGTH = 10;
export const POST_AUTHOR_PREFIX = '(글쓴이) ';
