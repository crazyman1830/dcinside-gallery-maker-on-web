import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

export const useUIState = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const [isWriteModalOpen, setIsWriteModalOpen] = useState<boolean>(false);
  const [isSavingUserPost, setIsSavingUserPost] = useState<boolean>(false);
  const [isAddingComment, setIsAddingComment] = useState<boolean>(false);

  const [highlightedCommentIds, setHighlightedCommentIds] = useState<Set<string>>(new Set());
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [generationPhase, setGenerationPhase] = useState<string>('connecting');
  const [generationMessage, setGenerationMessage] =
    useState<string>('AI 모델에 연결하고 있습니다.');
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);

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
    setWarningMessage(null);
    setIsLoading(true);
    setIsStreaming(true);
    setGenerationPhase('connecting');
    setGenerationMessage('AI 모델에 연결하고 있습니다.');
    setGenerationProgress(null);
    setWorldviewFeedback(null);
  }, []);

  // Callers list this object as a hook dependency, so it must only change with UI state.
  return useMemo(
    () => ({
      isLoading,
      setIsLoading,
      error,
      setError,
      successMessage,
      setSuccessMessage,
      warningMessage,
      setWarningMessage,
      isWriteModalOpen,
      openWriteModal,
      closeWriteModal,
      isSavingUserPost,
      setIsSavingUserPost,
      isAddingComment,
      setIsAddingComment,
      highlightedCommentIds,
      triggerCommentHighlight,
      isStreaming,
      setIsStreaming,
      generationPhase,
      setGenerationPhase,
      generationMessage,
      setGenerationMessage,
      generationProgress,
      setGenerationProgress,
      worldviewFeedback,
      setWorldviewFeedback,
      isFetchingFeedback,
      setIsFetchingFeedback,
      resetForNewGeneration,
    }),
    [
      closeWriteModal,
      error,
      generationMessage,
      generationPhase,
      generationProgress,
      highlightedCommentIds,
      isAddingComment,
      isFetchingFeedback,
      isLoading,
      isSavingUserPost,
      isStreaming,
      isWriteModalOpen,
      openWriteModal,
      resetForNewGeneration,
      successMessage,
      triggerCommentHighlight,
      warningMessage,
      worldviewFeedback,
    ],
  );
};
