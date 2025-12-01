
import { useState, useRef, useEffect, useCallback } from 'react';

export const useUIState = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [isWriteModalOpen, setIsWriteModalOpen] = useState<boolean>(false);
  const [isSavingUserPost, setIsSavingUserPost] = useState<boolean>(false);
  const [isAddingComment, setIsAddingComment] = useState<boolean>(false);
  
  const [highlightedCommentIds, setHighlightedCommentIds] = useState<Set<string>>(new Set());
  const [streamingText, setStreamingText] = useState<string | null>(null);
  
  const [worldviewFeedback, setWorldviewFeedback] = useState<string | null>(null);
  const [isFetchingFeedback, setIsFetchingFeedback] = useState<boolean>(false);

  // Refs for cleanup
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (successMessageTimeoutRef.current) clearTimeout(successMessageTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (successMessage) {
      if (successMessageTimeoutRef.current) clearTimeout(successMessageTimeoutRef.current);
      successMessageTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 3000);
    }
  }, [successMessage]);

  const triggerCommentHighlight = useCallback((ids: Set<string>) => {
      setHighlightedCommentIds(ids);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedCommentIds(new Set()), 2000);
  }, []);

  const openWriteModal = useCallback(() => setIsWriteModalOpen(true), []);
  const closeWriteModal = useCallback(() => setIsWriteModalOpen(false), []);

  const resetForNewGeneration = useCallback(() => {
      setError(null);
      setSuccessMessage(null);
      setIsLoading(true);
      setStreamingText('');
      setWorldviewFeedback(null);
  }, []);

  return {
      isLoading, setIsLoading,
      error, setError,
      successMessage, setSuccessMessage,
      isWriteModalOpen, openWriteModal, closeWriteModal,
      isSavingUserPost, setIsSavingUserPost,
      isAddingComment, setIsAddingComment,
      highlightedCommentIds, triggerCommentHighlight,
      streamingText, setStreamingText,
      worldviewFeedback, setWorldviewFeedback,
      isFetchingFeedback, setIsFetchingFeedback,
      resetForNewGeneration
  };
};
