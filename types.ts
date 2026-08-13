
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

export interface GalleryData {
  galleryTitle: string;
  posts: Post[]; 
  sources?: GroundingSource[]; // Added for Google Search Grounding
}

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
  isQualityUpgradeUnlocked: boolean;
  isQualityUpgradeEnabled: boolean;
  isSearchEnabled: boolean;
  /** Optional for presets created before provider selection was introduced. */
  selectedProvider?: AiProvider;
  selectedModel: string;
  // User Profile Settings
  userNicknameType: UserNicknameType;
  fixedNickname: string;
  userReputation: number;
}

export interface Preset {
  id: string;
  name: string;
  settings: GalleryFormSettings;
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

export type GalleryContextParams = CreateGalleryParams;

export interface NewPostData {
  title: string;
  author: string;
  content: string;
}
