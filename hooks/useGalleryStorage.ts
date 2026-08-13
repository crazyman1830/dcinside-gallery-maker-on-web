
import { useState, useEffect, useCallback } from 'react';
import { GalleryData, UserProfile, type AiProvider, type CreateGalleryParams } from '../types';
import { GalleryContextParams } from '../services/galleryService';
import {
    AI_MODELS,
    DEFAULT_AI_PROVIDER,
    migrateModelForProvider,
} from '../constants';

export const migrateGalleryContext = (value: unknown): GalleryContextParams | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const context = value as Partial<GalleryContextParams>;
    const provider: AiProvider = context.selectedProvider === 'vertex'
        ? 'vertex'
        : DEFAULT_AI_PROVIDER;
    const model = migrateModelForProvider(context.selectedModel, provider);
    if (!AI_MODELS[provider].some(option => option.value === model)) return null;
    const requiredStrings: Array<keyof CreateGalleryParams> = [
        'topic',
        'discussionContext',
        'worldviewValue',
        'worldviewEraValue',
        'toxicityLevelValue',
        'anonymousNickRatioValue',
        'userSpecies',
        'userAffiliation',
        'genderRatioValue',
    ];
    if (
        requiredStrings.some(key => typeof context[key] !== 'string')
        || !(typeof context.ageRangeValue === 'string' || (
            Array.isArray(context.ageRangeValue)
            && context.ageRangeValue.every(item => typeof item === 'string')
        ))
        || typeof context.useSearch !== 'boolean'
    ) return null;
    return {
        ...(context as CreateGalleryParams),
        selectedProvider: provider,
        selectedModel: model,
    };
};

export const useGalleryStorage = () => {
  const [galleryData, setGalleryData] = useState<GalleryData | null>(() => {
      try {
          const savedData = localStorage.getItem('galleryData');
          return savedData ? JSON.parse(savedData) : null;
      } catch (error) {
          console.error("Failed to load gallery data from local storage", error);
          return null;
      }
  });

  const [galleryContext, setGalleryContext] = useState<GalleryContextParams | null>(() => {
      try {
          const savedContext = localStorage.getItem('galleryContext');
          return savedContext ? migrateGalleryContext(JSON.parse(savedContext)) : null;
      } catch (error) {
          console.error("Failed to load gallery context from local storage", error);
          return null;
      }
  });

  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(() => {
    try {
        const savedProfile = localStorage.getItem('userProfile');
        return savedProfile ? JSON.parse(savedProfile) : null;
    } catch (error) {
        return null;
    }
  });

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Persistence Effects
  useEffect(() => {
      try {
          if (galleryData) {
              localStorage.setItem('galleryData', JSON.stringify(galleryData));
          } else {
              localStorage.removeItem('galleryData');
          }
      } catch (error) {
          console.error("Failed to save gallery data", error);
      }
  }, [galleryData]);

  useEffect(() => {
      try {
          if (galleryContext) {
              localStorage.setItem('galleryContext', JSON.stringify(galleryContext));
          } else {
              localStorage.removeItem('galleryContext');
          }
      } catch (error) {
          console.error("Failed to save gallery context", error);
      }
  }, [galleryContext]);

  useEffect(() => {
      try {
          if (currentUserProfile) {
              localStorage.setItem('userProfile', JSON.stringify(currentUserProfile));
          } else {
              localStorage.removeItem('userProfile');
          }
      } catch (error) {
          console.error("Failed to save user profile", error);
      }
  }, [currentUserProfile]);

  const selectPost = useCallback((postId: string) => {
    setSelectedPostId(postId);
    window.scrollTo(0, 0);
  }, []);

  const backToList = useCallback(() => {
    setSelectedPostId(null);
    window.scrollTo(0, 0);
  }, []);

  return {
    galleryData,
    setGalleryData,
    galleryContext,
    setGalleryContext,
    currentUserProfile,
    setCurrentUserProfile,
    selectedPostId,
    setSelectedPostId,
    selectPost,
    backToList
  };
};
