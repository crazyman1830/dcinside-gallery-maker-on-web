import type { FixedNickname, GalleryContinuationContext, UserProfile } from '../../types';

export interface PromptContext {
  fixedNicknames?: FixedNickname[];
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
  useSearch?: boolean;
  userProfile?: UserProfile;
  continuityNotes?: string;
  continuationContext?: GalleryContinuationContext;
}
