
import { useCallback, useMemo, useEffect } from 'react';
import { Comment, UserProfile } from '../types';
import * as galleryService from '../services/galleryService';
import { getFormattedErrorMessage } from '../utils/common';
import { MAX_TOTAL_COMMENTS_PER_POST, POST_AUTHOR_PREFIX } from '../constants';
import { useGalleryStorage } from './useGalleryStorage';
import { useUIState } from './useUIState';

const API_KEY_MISSING_APP_ERROR_MESSAGE = "API_KEY가 설정되지 않았습니다. 갤러리 생성 기능이 작동하지 않습니다. 환경 변수를 설정해주세요.";

interface ExtendedCreateGalleryParams extends galleryService.CreateGalleryParams {
    userProfile: UserProfile;
}

export const useGallery = () => {
  // Composition: Use specialized hooks
  const storage = useGalleryStorage();
  const ui = useUIState();

  // Initial API Key Check
  useEffect(() => {
    if (!galleryService.isApiKeyAvailable) {
      ui.setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
    }
  }, []);

  const createGallery = useCallback(async (params: ExtendedCreateGalleryParams) => {
    if (!galleryService.isApiKeyAvailable) {
        ui.setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
        return;
    }
    
    ui.resetForNewGeneration();
    storage.setGalleryData(null);
    storage.setSelectedPostId(null);

    try {
      const onChunkCallback = (text: string) => {
        ui.setStreamingText(prev => (prev ?? '') + text);
      };

      const data = await galleryService.createGalleryStreamed(params, onChunkCallback);
      
      storage.setGalleryData(data);
      storage.setGalleryContext(params);
      storage.setCurrentUserProfile(params.userProfile);
      
      if (data.posts.length > 0) ui.setSuccessMessage("갤러리가 성공적으로 생성되었습니다!");
      else ui.setSuccessMessage("갤러리 생성 조건에 맞는 게시물이 없거나 생성에 실패했습니다.");

    } catch (err) {
      console.error(err);
      ui.setError(getFormattedErrorMessage(err));
      ui.setStreamingText(null);
    } finally {
      ui.setIsLoading(false);
      ui.setStreamingText(null);
    }
  }, [storage, ui]);

  const saveUserPost = useCallback(async (
    title: string, author: string, content: string
  ) => {
      if (!galleryService.isApiKeyAvailable) {
          ui.setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
          ui.closeWriteModal();
          return;
      }
      if (!storage.galleryData || !storage.galleryContext) {
          ui.setError("오류: 갤러리 데이터 또는 컨텍스트가 없습니다. 글을 저장할 수 없습니다.");
          return;
      }

      ui.setIsSavingUserPost(true);
      ui.setError(null);
      ui.setSuccessMessage(null);

      try {
          const postData = { title, author, content };
          const finalNewPost = await galleryService.addUserPost(postData, storage.galleryContext, storage.galleryContext.selectedModel);
          storage.setGalleryData(prevData => prevData ? { ...prevData, posts: [finalNewPost, ...prevData.posts] } : null);
          ui.closeWriteModal();
          storage.setSelectedPostId(finalNewPost.id);
          ui.setSuccessMessage("새 글이 성공적으로 등록되었습니다!");
      } catch (err) {
          console.error("Error saving user post:", err);
          ui.setError(getFormattedErrorMessage(err, "사용자 글 처리 중 오류 발생"));
      } finally {
          ui.setIsSavingUserPost(false);
      }
  }, [storage, ui]);

  const addUserComment = useCallback(async (
    postId: string,
    commentText: string,
    commentAuthorInput: string,
  ) => {
    if (!galleryService.isApiKeyAvailable) {
        ui.setError(API_KEY_MISSING_APP_ERROR_MESSAGE); return;
    }
    if (!storage.galleryData || !storage.galleryContext) {
      ui.setError("갤러리 데이터 또는 컨텍스트가 없어 댓글을 추가할 수 없습니다."); return;
    }
    const postIndex = storage.galleryData.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) { ui.setError("댓글을 추가할 게시물을 찾을 수 없습니다."); return; }

    const targetPost = storage.galleryData.posts[postIndex];
    if (targetPost.comments.length >= MAX_TOTAL_COMMENTS_PER_POST) {
      ui.setError(`댓글은 최대 ${MAX_TOTAL_COMMENTS_PER_POST}개까지 작성할 수 있습니다.`); return;
    }

    ui.setIsAddingComment(true); ui.setError(null); ui.setSuccessMessage(null);

    const finalCommentAuthor = commentAuthorInput === targetPost.author ? `${POST_AUTHOR_PREFIX}${commentAuthorInput}` : commentAuthorInput;
    const newUserComment: Comment = {
      id: `user-comment-${postId}-${Date.now()}`, 
      author: finalCommentAuthor, 
      text: commentText,
      timestamp: new Date().toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      recommendations: 0, nonRecommendations: 0,
    };

    const newCommentIdsToHighlight = new Set<string>([newUserComment.id]);
    const updatedComments = [...targetPost.comments, newUserComment];
    let updatedPosts = [...storage.galleryData.posts];
    updatedPosts[postIndex] = { ...targetPost, comments: updatedComments };
    storage.setGalleryData({ ...storage.galleryData, posts: updatedPosts });

    try {
      const aiFollowUpComments = await galleryService.addFollowUpComments(
        targetPost, updatedComments, storage.galleryContext, storage.galleryContext.selectedModel
      );
      
      aiFollowUpComments.forEach(c => newCommentIdsToHighlight.add(c.id));

      const finalCommentsWithAIFollowUps = [...updatedComments, ...aiFollowUpComments];
      finalCommentsWithAIFollowUps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      storage.setGalleryData(currentData => {
        if (!currentData) return null;
        const posts = [...currentData.posts];
        const pIndex = posts.findIndex(p => p.id === postId);
        if (pIndex > -1) {
          posts[pIndex] = { ...posts[pIndex], comments: finalCommentsWithAIFollowUps };
        }
        return { ...currentData, posts };
      });
      ui.setSuccessMessage("댓글이 등록되었고 AI가 응답했습니다.");
    } catch (err) {
      console.error("Error generating follow-up comments:", err);
      ui.setError(getFormattedErrorMessage(err, "AI 후속 댓글 생성 중 오류 발생"));
      // Rollback logic for AI comments only not implemented strictly here for brevity, 
      // but UI shows error. (Existing logic was slightly loose too)
      ui.setSuccessMessage("댓글이 등록되었습니다 (AI 응답은 실패).");
    } finally {
      ui.setIsAddingComment(false);
      ui.triggerCommentHighlight(newCommentIdsToHighlight);
    }
  }, [storage, ui]);

  const fetchWorldviewFeedback = useCallback(async () => {
    if (!storage.galleryData || !storage.galleryContext || storage.galleryContext.worldviewValue !== 'CUSTOM') {
        ui.setError("피드백은 '직접 입력' 세계관으로 생성된 갤러리에만 제공됩니다.");
        return;
    }
    if (!galleryService.isApiKeyAvailable) {
        ui.setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
        return;
    }

    ui.setIsFetchingFeedback(true);
    ui.setError(null);
    ui.setWorldviewFeedback(null);

    try {
        const feedback = await galleryService.getWorldviewFeedback(
            storage.galleryContext.customWorldviewText || '',
            storage.galleryData,
            storage.galleryContext.selectedModel
        );
        ui.setWorldviewFeedback(feedback);
    } catch (err) {
        ui.setError(getFormattedErrorMessage(err, "세계관 피드백 생성 중 오류 발생"));
    } finally {
        ui.setIsFetchingFeedback(false);
    }
  }, [storage, ui]);

  const openWriteModalWrapper = useCallback(() => {
      if (!galleryService.isApiKeyAvailable) {
          ui.setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
          return;
      }
      if (!storage.galleryData) {
          ui.setError("갤러리가 먼저 생성되어야 글을 작성할 수 있습니다.");
          return;
      }
      ui.openWriteModal();
  }, [storage.galleryData, ui]);

  const selectedPost = useMemo(() => {
    if (!storage.selectedPostId || !storage.galleryData) return null;
    return storage.galleryData.posts.find(post => post.id === storage.selectedPostId) || null;
  }, [storage.selectedPostId, storage.galleryData]);

  // Facade Export
  return {
    // Data
    galleryData: storage.galleryData,
    galleryContext: storage.galleryContext,
    currentUserProfile: storage.currentUserProfile,
    selectedPost,
    
    // UI State
    isLoading: ui.isLoading,
    error: ui.error,
    successMessage: ui.successMessage,
    isWriteModalOpen: ui.isWriteModalOpen,
    isSavingUserPost: ui.isSavingUserPost,
    isAddingComment: ui.isAddingComment,
    highlightedCommentIds: ui.highlightedCommentIds,
    streamingText: ui.streamingText,
    API_KEY_MISSING_APP_ERROR_MESSAGE,
    worldviewFeedback: ui.worldviewFeedback,
    isFetchingFeedback: ui.isFetchingFeedback,

    // Actions
    createGallery,
    selectPost: storage.selectPost,
    backToList: storage.backToList,
    openWriteModal: openWriteModalWrapper,
    closeWriteModal: ui.closeWriteModal,
    saveUserPost,
    addUserComment,
    fetchWorldviewFeedback,
    setError: ui.setError
  };
};
