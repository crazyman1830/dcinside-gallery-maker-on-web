
import { useState, useEffect, useCallback } from 'react';
import { GalleryData, UserProfile } from '../types';
import { GalleryContextParams } from '../services/galleryService';

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
          return savedContext ? JSON.parse(savedContext) : null;
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
