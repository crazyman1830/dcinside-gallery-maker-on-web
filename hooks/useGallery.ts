
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GalleryData, Post, Comment, UserProfile } from '../types';
import * as galleryService from '../services/galleryService';
import { getFormattedErrorMessage } from '../utils/common';
import { MAX_TOTAL_COMMENTS_PER_POST, POST_AUTHOR_PREFIX } from '../constants';

const API_KEY_MISSING_APP_ERROR_MESSAGE = "API_KEY가 설정되지 않았습니다. 갤러리 생성 기능이 작동하지 않습니다. 환경 변수를 설정해주세요.";

interface ExtendedCreateGalleryParams extends galleryService.CreateGalleryParams {
    userProfile: UserProfile;
}

export const useGallery = () => {
  const [galleryData, setGalleryData] = useState<GalleryData | null>(() => {
      try {
          const savedData = localStorage.getItem('galleryData');
          return savedData ? JSON.parse(savedData) : null;
      } catch (error) {
          console.error("로컬 스토리지에서 갤러리 데이터를 불러오는 데 실패했습니다.", error);
          return null;
      }
  });
  const [galleryContext, setGalleryContext] = useState<galleryService.GalleryContextParams | null>(() => {
      try {
          const savedContext = localStorage.getItem('galleryContext');
          return savedContext ? JSON.parse(savedContext) : null;
      } catch (error) {
          console.error("로컬 스토리지에서 갤러리 컨텍스트를 불러오는 데 실패했습니다.", error);
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

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
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
      try {
          if (galleryData) {
              localStorage.setItem('galleryData', JSON.stringify(galleryData));
          } else {
              localStorage.removeItem('galleryData');
          }
      } catch (error) {
          console.error("갤러리 데이터를 로컬 스토리지에 저장하는 데 실패했습니다.", error);
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
          console.error("갤러리 컨텍스트를 로컬 스토리지에 저장하는 데 실패했습니다.", error);
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
          console.error("유저 프로필을 로컬 스토리지에 저장하는 데 실패했습니다.", error);
      }
  }, [currentUserProfile]);


  useEffect(() => {
    if (!galleryService.isApiKeyAvailable) {
      setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
    }
    // Cleanup function for timeouts
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

  const createGallery = useCallback(async (params: ExtendedCreateGalleryParams) => {
    if (!galleryService.isApiKeyAvailable) {
        setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
        return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);
    setGalleryData(null);
    setSelectedPostId(null);
    setStreamingText('');
    setWorldviewFeedback(null);

    try {
      const onChunkCallback = (text: string) => {
        setStreamingText(prev => (prev ?? '') + text);
      };

      const data = await galleryService.createGalleryStreamed(params, onChunkCallback);
      
      setGalleryData(data);
      setGalleryContext(params);
      setCurrentUserProfile(params.userProfile);
      
      if (data.posts.length > 0) setSuccessMessage("갤러리가 성공적으로 생성되었습니다!");
      else setSuccessMessage("갤러리 생성 조건에 맞는 게시물이 없거나 생성에 실패했습니다.");

    } catch (err) {
      console.error(err);
      setError(getFormattedErrorMessage(err));
      setStreamingText(null); // Ensure streaming text is cleared on error
    } finally {
      setIsLoading(false);
      setStreamingText(null);
    }
  }, []);

  const selectPost = useCallback((postId: string) => {
    setSelectedPostId(postId);
    window.scrollTo(0, 0);
  }, []);

  const backToList = useCallback(() => {
    setSelectedPostId(null);
    window.scrollTo(0, 0);
  }, []);
  
  const openWriteModal = useCallback(() => {
    if (!galleryService.isApiKeyAvailable) {
        setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
        return;
    }
    if (!galleryData) {
        setError("갤러리가 먼저 생성되어야 글을 작성할 수 있습니다. 주제를 입력하고 '갤러리 생성'을 눌러주세요.");
        return;
    }
    setIsWriteModalOpen(true);
  }, [galleryData]);

  const closeWriteModal = useCallback(() => setIsWriteModalOpen(false), []);

  const saveUserPost = useCallback(async (
    title: string, author: string, content: string
  ) => {
      if (!galleryService.isApiKeyAvailable) {
          setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
          setIsWriteModalOpen(false);
          return;
      }
      if (!galleryData || !galleryContext) {
          setError("오류: 갤러리 데이터 또는 컨텍스트가 없습니다. 글을 저장할 수 없습니다.");
          return;
      }

      setIsSavingUserPost(true);
      setError(null);
      setSuccessMessage(null);

      try {
          const postData = { title, author, content };
          const finalNewPost = await galleryService.addUserPost(postData, galleryContext, galleryContext.selectedModel);
          setGalleryData(prevData => prevData ? { ...prevData, posts: [finalNewPost, ...prevData.posts] } : null);
          setIsWriteModalOpen(false);
          setSelectedPostId(finalNewPost.id);
          setSuccessMessage("새 글이 성공적으로 등록되었습니다!");
      } catch (err) {
          console.error("Error saving user post:", err);
          setError(getFormattedErrorMessage(err, "사용자 글 처리 중 오류 발생"));
      } finally {
          setIsSavingUserPost(false);
      }
  }, [galleryData, galleryContext]);

  const addUserComment = useCallback(async (
    postId: string,
    commentText: string,
    commentAuthorInput: string,
  ) => {
    if (!galleryService.isApiKeyAvailable) {
        setError(API_KEY_MISSING_APP_ERROR_MESSAGE); return;
    }
    if (!galleryData || !galleryContext) {
      setError("갤러리 데이터 또는 컨텍스트가 없어 댓글을 추가할 수 없습니다."); return;
    }
    const postIndex = galleryData.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) { setError("댓글을 추가할 게시물을 찾을 수 없습니다."); return; }

    const targetPost = galleryData.posts[postIndex];
    if (targetPost.comments.length >= MAX_TOTAL_COMMENTS_PER_POST) {
      setError(`댓글은 최대 ${MAX_TOTAL_COMMENTS_PER_POST}개까지 작성할 수 있습니다.`); return;
    }

    setIsAddingComment(true); setError(null); setSuccessMessage(null);

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
    let updatedPosts = [...galleryData.posts];
    updatedPosts[postIndex] = { ...targetPost, comments: updatedComments };
    setGalleryData({ ...galleryData, posts: updatedPosts });

    try {
      const aiFollowUpComments = await galleryService.addFollowUpComments(
        targetPost, updatedComments, galleryContext, galleryContext.selectedModel
      );
      
      aiFollowUpComments.forEach(c => newCommentIdsToHighlight.add(c.id));

      const finalCommentsWithAIFollowUps = [...updatedComments, ...aiFollowUpComments];
      finalCommentsWithAIFollowUps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      setGalleryData(currentData => {
        if (!currentData) return null;
        const posts = [...currentData.posts];
        const pIndex = posts.findIndex(p => p.id === postId);
        if (pIndex > -1) {
          posts[pIndex] = { ...posts[pIndex], comments: finalCommentsWithAIFollowUps };
        }
        return { ...currentData, posts };
      });
      setSuccessMessage("댓글이 등록되었고 AI가 응답했습니다.");
    } catch (err) {
      console.error("Error generating follow-up comments:", err);
      setError(getFormattedErrorMessage(err, "AI 후속 댓글 생성 중 오류 발생"));
      setGalleryData(prevData => {
        if (!prevData) return null;
        const posts = [...prevData.posts];
        const pIndex = posts.findIndex(p => p.id === postId);
        if (pIndex > -1) {
            posts[pIndex].comments = posts[pIndex].comments.filter(c => !c.id.startsWith('ai-followup-comment-'));
        }
        return { ...prevData, posts };
      });
      setSuccessMessage("댓글이 등록되었습니다 (AI 응답은 실패).");
    } finally {
      setIsAddingComment(false);
      setHighlightedCommentIds(newCommentIdsToHighlight);
      
      // Clean previous timeout if any
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedCommentIds(new Set()), 2000);
    }
  }, [galleryData, galleryContext]);

  const fetchWorldviewFeedback = useCallback(async () => {
    if (!galleryData || !galleryContext || galleryContext.worldviewValue !== 'CUSTOM') {
        setError("피드백은 '직접 입력' 세계관으로 생성된 갤러리에만 제공됩니다.");
        return;
    }
    if (!galleryService.isApiKeyAvailable) {
        setError(API_KEY_MISSING_APP_ERROR_MESSAGE);
        return;
    }

    setIsFetchingFeedback(true);
    setError(null);
    setWorldviewFeedback(null);

    try {
        const feedback = await galleryService.getWorldviewFeedback(
            galleryContext.customWorldviewText || '',
            galleryData,
            galleryContext.selectedModel
        );
        setWorldviewFeedback(feedback);
    } catch (err) {
        setError(getFormattedErrorMessage(err, "세계관 피드백 생성 중 오류 발생"));
    } finally {
        setIsFetchingFeedback(false);
    }
  }, [galleryData, galleryContext]);

  const selectedPost = useMemo(() => {
    if (!selectedPostId || !galleryData) return null;
    return galleryData.posts.find(post => post.id === selectedPostId) || null;
  }, [selectedPostId, galleryData]);
  
  return {
    galleryData,
    galleryContext,
    currentUserProfile,
    isLoading,
    error,
    successMessage,
    selectedPost,
    isWriteModalOpen,
    isSavingUserPost,
    isAddingComment,
    highlightedCommentIds,
    streamingText,
    API_KEY_MISSING_APP_ERROR_MESSAGE,
    worldviewFeedback,
    isFetchingFeedback,
    createGallery,
    selectPost,
    backToList,
    openWriteModal,
    closeWriteModal,
    saveUserPost,
    addUserComment,
    fetchWorldviewFeedback,
    setError
  };
};
