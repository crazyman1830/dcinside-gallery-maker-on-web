// --- Domain Types ---
// These types define the data structures used within the application's state.

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  recommendations: number;
  nonRecommendations: number;
  voted?: 'rec' | 'nonrec' | null;
  /** Stable reply metadata. Legacy comments may omit this field. */
  replyTo?: ReplyTarget;
}

export interface ReplyTarget {
  commentId: string;
  author: string;
}

export interface Post {
  id: string;
  title: string;
  author: string;
  timestamp: string;
  content: string;
  views: number;
  recommendations: number;
  nonRecommendations: number;
  comments: Comment[];
  isBestPost?: boolean;
  voted?: 'rec' | 'nonrec' | null;
}

export interface GroundingSource {
  title?: string;
  uri?: string;
}

/**
 * Provider-owned Google Search Suggestions markup. This is transient response
 * metadata and must never be persisted or sent back to an AI provider.
 */
export interface GroundingSearchEntryPoint {
  renderedContent: string;
}

export type GenerationWarningStage = 'evaluation' | 'comments' | 'grounding' | 'storage';

export interface GenerationWarning {
  code: string;
  message: string;
  stage?: GenerationWarningStage;
  postId?: string;
}

export interface GalleryData {
  galleryTitle: string;
  posts: Post[];
  /** Transient Google Search grounding links; never persist or reuse as AI input. */
  sources?: GroundingSource[];
  /** Transient provider markup; never persist or reuse as AI input. */
  searchEntryPoint?: GroundingSearchEntryPoint;
  warnings?: GenerationWarning[];
}

export type PersistedGalleryData = Omit<GalleryData, 'sources' | 'searchEntryPoint'>;

export type UserNicknameType = 'FIXED' | 'ANONYMOUS';

export type AiProvider = 'gemini' | 'vertex';

export type VertexAuthMode = 'service_account' | 'adc';

export interface UserProfile {
  nicknameType: UserNicknameType;
  nickname: string;
  ip?: string; // Only for ANONYMOUS, e.g., (123.45)
  reputation: number; // 0 to 100 (0: Hated, 50: Neutral, 100: Idolized)
}

// --- API Types ---
// These types define the expected JSON structures from the Gemini API.

export interface GeminiCommentContent {
  author: string;
  text: string;
  recommendations?: number;
  nonRecommendations?: number;
}

export interface GeminiPostContent {
  title: string;
  author: string;
  content: string;
  comments?: GeminiCommentContent[];
}

export interface GeminiResponseData {
  galleryTitle: string;
  posts: GeminiPostContent[];
}

export interface GeminiEvaluationResponse {
  suggestedViews: number;
  suggestedRecommendations: number;
  suggestedNonRecommendations: number;
}

// --- Form & Preset Types ---
export interface GalleryFormSettings {
  topic: string;
  discussionContext: string;
  selectedWorldview: string;
  customWorldviewText: string;
  selectedWorldviewEra: string;
  selectedToxicityLevel: string;
  selectedAnonymousNickRatio: string;
  userSpecies: string;
  userAffiliation: string;
  isManualGenderRatio: boolean;
  manualMalePercentage: number;
  isManualAgeRange: boolean;
  manualSelectedAgeGroups: string[]; // Use array for serialization
  isSearchEnabled: boolean;
  /** Optional for presets created before provider selection was introduced. */
  selectedProvider?: AiProvider;
  selectedModel: string;
  // User Profile Settings
  userNicknameType: UserNicknameType;
  fixedNickname: string;
  userReputation: number;
}

export type PresetContentSettings = Omit<
  GalleryFormSettings,
  'isSearchEnabled' | 'selectedProvider' | 'selectedModel'
>;

export interface Preset {
  id: string;
  name: string;
  /** Scenario/profile only. Provider, model, search, and credentials are session settings. */
  settings: PresetContentSettings;
}

export interface CreateGalleryParams {
  topic: string;
  discussionContext: string;
  worldviewValue: string;
  customWorldviewText?: string;
  worldviewEraValue: string;
  toxicityLevelValue: string;
  anonymousNickRatioValue: string;
  userSpecies: string;
  userAffiliation: string;
  genderRatioValue: string;
  ageRangeValue: string | string[];
  selectedProvider: AiProvider;
  selectedModel: string;
  useSearch: boolean;
  userProfile?: UserProfile;
}

export type CreateGalleryInput = CreateGalleryParams;

/** Local session metadata plus the AI request settings that produced the gallery. */
export type GalleryContextParams = CreateGalleryParams & {
  worldlineId: string;
};

export interface FollowUpPostContext {
  id: string;
  title: string;
  author: string;
  content: string;
}

export interface WorldviewFeedbackCommentSample {
  author: string;
  text: string;
}

export interface WorldviewFeedbackPostSample {
  title: string;
  content: string;
  comments: WorldviewFeedbackCommentSample[];
}

export interface WorldviewFeedbackGallerySample {
  galleryTitle: string;
  posts: WorldviewFeedbackPostSample[];
}

export interface NewPostData {
  title: string;
  author: string;
  content: string;
}

// --- Persisted session & application state ---

export interface GallerySessionV2 {
  version: 2;
  revision: number;
  savedAt: string;
  gallery: PersistedGalleryData;
  context: GalleryContextParams;
  profile: UserProfile | null;
}

export type AppView = 'setup' | 'gallery-list' | 'post';

export type AsyncJobKind = 'gallery' | 'post' | 'follow-up' | 'feedback' | 'credential-test';

export interface AsyncJob {
  kind: AsyncJobKind;
  requestId: string;
  sessionRevision: number;
  startedAt: string;
  abortController: AbortController;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  field?: string;
  retryable: boolean;
  requestId: string;
}

export type GalleryStreamEvent =
  | { type: 'phase'; phase: string; message?: string; progress?: number }
  | { type: 'chunk'; text: string }
  | { type: 'warning'; warning: GenerationWarning }
  | { type: 'result'; data: GalleryData }
  | {
      type: 'error';
      message: string;
      code?: string;
      retryable?: boolean;
      retryAfterSeconds?: number;
      requestId?: string;
    };

export interface AddUserPostResponse {
  post: Post;
  warnings: GenerationWarning[];
}
