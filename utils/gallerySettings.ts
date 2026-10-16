import type { GalleryContextParams, GalleryFormSettings, UserProfile } from '../types';

/** Restore only editable settings; credentials never enter form/session snapshots. */
export const galleryContextToFormSettings = (
  context: GalleryContextParams | null,
  profile: UserProfile | null,
): Partial<GalleryFormSettings> => {
  if (!context) return {};
  const user = profile ?? context.userProfile;
  return {
    fixedNicknames: context.fixedNicknames ?? [],
    topic: context.topic,
    discussionContext: context.discussionContext,
    selectedWorldview: context.worldviewValue,
    customWorldviewText: context.customWorldviewText ?? '',
    selectedWorldviewEra: context.worldviewEraValue,
    selectedToxicityLevel: context.toxicityLevelValue,
    selectedAnonymousNickRatio: context.anonymousNickRatioValue,
    userSpecies: context.userSpecies,
    userAffiliation: context.userAffiliation,
    isManualGenderRatio: context.genderRatioValue !== 'AUTO',
    manualMalePercentage:
      context.genderRatioValue === 'AUTO' ? 50 : Number(context.genderRatioValue),
    isManualAgeRange: Array.isArray(context.ageRangeValue),
    manualSelectedAgeGroups: Array.isArray(context.ageRangeValue) ? [...context.ageRangeValue] : [],
    selectedProvider: context.selectedProvider,
    selectedModel: context.selectedModel,
    isSearchEnabled: context.useSearch,
    userNicknameType: user?.nicknameType ?? 'ANONYMOUS',
    fixedNickname: user?.nicknameType === 'FIXED' ? user.nickname : '',
    userReputation: user?.reputation ?? 50,
  };
};
