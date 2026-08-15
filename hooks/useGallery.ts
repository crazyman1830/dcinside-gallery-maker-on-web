import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type AsyncJob,
  type AsyncJobKind,
  Comment,
  type CreateGalleryInput,
  type GalleryContextParams,
  UserProfile,
  type ReplyTarget,
} from '../types';
import * as galleryService from '../services/galleryService';
import { createTimestamp, getFormattedErrorMessage, timestampToEpoch } from '../utils/common';
import { createWorldlineId } from '../utils/worldline';
import { MAX_TOTAL_COMMENTS_PER_POST, POST_AUTHOR_PREFIX } from '../constants';
import { useGalleryStorage } from './useGalleryStorage';
import { useUIState } from './useUIState';

interface ExtendedCreateGalleryParams extends CreateGalleryInput {
  userProfile: UserProfile;
}

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError');

export const useGallery = () => {
  const storage = useGalleryStorage();
  const ui = useUIState();

  const nextRequestIdRef = useRef(0);
  const sessionRevisionRef = useRef(0);
  const generationRequestRef = useRef<AsyncJob | null>(null);
  const postRequestRef = useRef<AsyncJob | null>(null);
  const commentRequestRef = useRef<AsyncJob | null>(null);
  const feedbackRequestRef = useRef<AsyncJob | null>(null);

  useEffect(() => {
    sessionRevisionRef.current = storage.revision;
  }, [storage.revision]);

  const makeRequest = useCallback(
    (kind: AsyncJobKind): AsyncJob => ({
      kind,
      requestId: `job-${Date.now()}-${++nextRequestIdRef.current}`,
      sessionRevision: sessionRevisionRef.current,
      startedAt: createTimestamp(),
      abortController: new AbortController(),
    }),
    [],
  );

  const abortSessionRequests = useCallback(() => {
    postRequestRef.current?.abortController.abort();
    commentRequestRef.current?.abortController.abort();
    feedbackRequestRef.current?.abortController.abort();
    postRequestRef.current = null;
    commentRequestRef.current = null;
    feedbackRequestRef.current = null;
    ui.setIsSavingUserPost(false);
    ui.setIsAddingComment(false);
    ui.setIsFetchingFeedback(false);
  }, [ui]);

  useEffect(
    () => () => {
      generationRequestRef.current?.abortController.abort();
      postRequestRef.current?.abortController.abort();
      commentRequestRef.current?.abortController.abort();
      feedbackRequestRef.current?.abortController.abort();
    },
    [],
  );

  const createGallery = useCallback(
    async (params: ExtendedCreateGalleryParams): Promise<boolean> => {
      generationRequestRef.current?.abortController.abort();
      abortSessionRequests();

      const request = makeRequest('gallery');
      generationRequestRef.current = request;
      ui.resetForNewGeneration();

      const isCurrent = () => generationRequestRef.current?.requestId === request.requestId;

      try {
        const worldlineId = createWorldlineId();
        const generationParams: CreateGalleryInput & { userProfile: UserProfile } = {
          ...params,
        };
        const data = await galleryService.createGalleryStreamed(
          generationParams,
          text => {
            if (!isCurrent()) return;
            // Keep only a small rolling sample. Progress is driven by explicit
            // server phases instead of repeatedly parsing the complete JSON.
            ui.setStreamingText(previous => `${previous ?? ''}${text}`.slice(-4_000));
          },
          request.abortController.signal,
          (phase, message, progress) => {
            if (!isCurrent()) return;
            ui.setGenerationPhase(phase);
            if (message) ui.setGenerationMessage(message);
            if (typeof progress === 'number') ui.setGenerationProgress(progress);
          },
        );

        if (!isCurrent()) return false;

        // The previous session remains untouched until a complete result exists.
        // These synchronous state updates are batched into a single commit.
        sessionRevisionRef.current = storage.revision + 1;
        const galleryContext: GalleryContextParams = { ...generationParams, worldlineId };
        storage.replaceSession(data, galleryContext, generationParams.userProfile);

        ui.setWarningMessage(null);
        if (data.warnings?.length) {
          ui.setWarningMessage(
            `갤러리는 생성되었지만 일부 작업에 주의가 필요합니다: ${data.warnings[0].message}`,
          );
        } else if (data.posts.length > 0) {
          ui.setSuccessMessage('갤러리가 성공적으로 생성되었습니다!');
        } else {
          ui.setWarningMessage('생성된 게시물이 없습니다. 설정을 바꿔 다시 시도해주세요.');
        }
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        if (isAbortError(error)) {
          ui.setWarningMessage('갤러리 생성을 취소했습니다. 기존 갤러리는 그대로 보존됩니다.');
        } else {
          console.error(error);
          ui.setError(getFormattedErrorMessage(error));
        }
        return false;
      } finally {
        if (isCurrent()) {
          generationRequestRef.current = null;
          ui.setIsLoading(false);
          ui.setStreamingText(null);
        }
      }
    },
    [abortSessionRequests, makeRequest, storage, ui],
  );

  const cancelGeneration = useCallback(() => {
    const activeRequest = generationRequestRef.current;
    if (!activeRequest) return;
    ui.setGenerationMessage('생성 요청을 취소하고 있습니다.');
    activeRequest.abortController.abort();
  }, [ui]);

  const saveUserPost = useCallback(
    async (title: string, author: string, content: string): Promise<boolean> => {
      if (!storage.galleryData || !storage.galleryContext) {
        ui.setError('오류: 갤러리 데이터 또는 컨텍스트가 없습니다. 글을 저장할 수 없습니다.');
        return false;
      }

      postRequestRef.current?.abortController.abort();
      const request = makeRequest('post');
      postRequestRef.current = request;
      ui.setIsSavingUserPost(true);
      ui.setError(null);
      ui.setWarningMessage(null);
      ui.setSuccessMessage(null);

      try {
        const postResponse = await galleryService.addUserPost(
          { title, author, content },
          storage.galleryContext,
          storage.galleryContext.selectedModel,
          request.abortController.signal,
        );
        if (
          postRequestRef.current?.requestId !== request.requestId ||
          request.sessionRevision !== sessionRevisionRef.current
        )
          return false;

        const finalNewPost = postResponse.post;
        const postWarnings = postResponse.warnings;

        storage.setGalleryData(previous =>
          previous ? { ...previous, posts: [finalNewPost, ...previous.posts] } : null,
        );
        ui.closeWriteModal();
        storage.setSelectedPostId(finalNewPost.id);
        if (postWarnings.length > 0) {
          ui.setWarningMessage(
            `글은 등록되었지만 일부 AI 작업에 주의가 필요합니다: ${postWarnings[0].message}`,
          );
        } else {
          ui.setSuccessMessage('새 글이 성공적으로 등록되었습니다!');
        }
        return true;
      } catch (error) {
        if (!isAbortError(error) && postRequestRef.current?.requestId === request.requestId) {
          console.error('Error saving user post:', error);
          ui.setError(getFormattedErrorMessage(error, '사용자 글 처리 중 오류 발생'));
        }
        return false;
      } finally {
        if (postRequestRef.current?.requestId === request.requestId) {
          postRequestRef.current = null;
          ui.setIsSavingUserPost(false);
        }
      }
    },
    [makeRequest, storage, ui],
  );

  const addUserComment = useCallback(
    async (
      postId: string,
      commentText: string,
      commentAuthorInput: string,
      replyTo?: ReplyTarget,
    ) => {
      if (!storage.galleryData || !storage.galleryContext) {
        ui.setError('갤러리 데이터 또는 컨텍스트가 없어 댓글을 추가할 수 없습니다.');
        return;
      }
      const postIndex = storage.galleryData.posts.findIndex(post => post.id === postId);
      if (postIndex === -1) {
        ui.setError('댓글을 추가할 게시물을 찾을 수 없습니다.');
        return;
      }

      const targetPost = storage.galleryData.posts[postIndex];
      if (targetPost.comments.length >= MAX_TOTAL_COMMENTS_PER_POST) {
        ui.setError(`댓글은 최대 ${MAX_TOTAL_COMMENTS_PER_POST}개까지 작성할 수 있습니다.`);
        return;
      }

      commentRequestRef.current?.abortController.abort();
      const request = makeRequest('follow-up');
      commentRequestRef.current = request;
      ui.setIsAddingComment(true);
      ui.setError(null);
      ui.setWarningMessage(null);
      ui.setSuccessMessage(null);

      const finalCommentAuthor =
        commentAuthorInput === targetPost.author
          ? `${POST_AUTHOR_PREFIX}${commentAuthorInput}`
          : commentAuthorInput;
      const textForAi = replyTo ? `@${replyTo.author} ${commentText}` : commentText;
      const newUserComment: Comment = {
        id: `user-comment-${postId}-${request.requestId}`,
        author: finalCommentAuthor,
        text: textForAi,
        timestamp: createTimestamp(),
        recommendations: 0,
        nonRecommendations: 0,
        ...(replyTo ? { replyTo } : {}),
      };

      const newCommentIdsToHighlight = new Set<string>([newUserComment.id]);
      const updatedComments = [...targetPost.comments, newUserComment];
      storage.setGalleryData(previous => {
        if (!previous || request.sessionRevision !== sessionRevisionRef.current) return previous;
        return {
          ...previous,
          posts: previous.posts.map(post =>
            post.id === postId ? { ...post, comments: [...post.comments, newUserComment] } : post,
          ),
        };
      });

      if (updatedComments.length >= MAX_TOTAL_COMMENTS_PER_POST) {
        commentRequestRef.current = null;
        ui.setIsAddingComment(false);
        ui.setSuccessMessage(
          '댓글이 등록되었습니다. 댓글 상한에 도달해 AI 후속 응답은 생성하지 않았습니다.',
        );
        ui.triggerCommentHighlight(newCommentIdsToHighlight);
        return;
      }

      try {
        const generatedComments = await galleryService.addFollowUpComments(
          targetPost,
          updatedComments,
          storage.galleryContext,
          storage.galleryContext.selectedModel,
          request.abortController.signal,
        );
        if (
          commentRequestRef.current?.requestId !== request.requestId ||
          request.sessionRevision !== sessionRevisionRef.current
        )
          return;

        storage.setGalleryData(currentData => {
          if (!currentData || request.sessionRevision !== sessionRevisionRef.current)
            return currentData;
          return {
            ...currentData,
            posts: currentData.posts.map(post => {
              if (post.id !== postId) return post;
              const mergedComments = [...post.comments];
              const knownIds = new Set(mergedComments.map(comment => comment.id));
              for (const generatedComment of generatedComments) {
                if (mergedComments.length >= MAX_TOTAL_COMMENTS_PER_POST) break;
                if (knownIds.has(generatedComment.id)) continue;
                knownIds.add(generatedComment.id);
                mergedComments.push(generatedComment);
                newCommentIdsToHighlight.add(generatedComment.id);
              }
              mergedComments.sort(
                (left, right) =>
                  timestampToEpoch(left.timestamp) - timestampToEpoch(right.timestamp),
              );
              return { ...post, comments: mergedComments };
            }),
          };
        });
        ui.setSuccessMessage('댓글이 등록되었고 AI가 응답했습니다.');
      } catch (error) {
        if (!isAbortError(error) && commentRequestRef.current?.requestId === request.requestId) {
          console.error('Error generating follow-up comments:', error);
          ui.setWarningMessage('댓글은 등록되었지만 AI 응답 생성에 실패했습니다.');
        }
      } finally {
        if (commentRequestRef.current?.requestId === request.requestId) {
          commentRequestRef.current = null;
          ui.setIsAddingComment(false);
          ui.triggerCommentHighlight(newCommentIdsToHighlight);
        }
      }
    },
    [makeRequest, storage, ui],
  );

  const fetchWorldviewFeedback = useCallback(async () => {
    if (
      !storage.galleryData ||
      !storage.galleryContext ||
      storage.galleryContext.worldviewValue !== 'CUSTOM'
    ) {
      ui.setError("피드백은 '직접 입력' 세계관으로 생성된 갤러리에만 제공됩니다.");
      return;
    }

    feedbackRequestRef.current?.abortController.abort();
    const request = makeRequest('feedback');
    feedbackRequestRef.current = request;
    ui.setIsFetchingFeedback(true);
    ui.setError(null);
    ui.setWarningMessage(null);
    ui.setWorldviewFeedback(null);

    try {
      const feedback = await galleryService.getWorldviewFeedback(
        storage.galleryContext.customWorldviewText || '',
        storage.galleryData,
        storage.galleryContext.selectedModel,
        storage.galleryContext.selectedProvider,
        request.abortController.signal,
      );
      if (
        feedbackRequestRef.current?.requestId === request.requestId &&
        request.sessionRevision === sessionRevisionRef.current
      )
        ui.setWorldviewFeedback(feedback);
    } catch (error) {
      if (!isAbortError(error) && feedbackRequestRef.current?.requestId === request.requestId) {
        ui.setError(getFormattedErrorMessage(error, '세계관 피드백 생성 중 오류 발생'));
      }
    } finally {
      if (feedbackRequestRef.current?.requestId === request.requestId) {
        feedbackRequestRef.current = null;
        ui.setIsFetchingFeedback(false);
      }
    }
  }, [makeRequest, storage, ui]);

  const openWriteModalWrapper = useCallback(() => {
    if (!storage.galleryData) {
      ui.setError('갤러리가 먼저 생성되어야 글을 작성할 수 있습니다.');
      return;
    }
    ui.openWriteModal();
  }, [storage.galleryData, ui]);

  const votePost = useCallback(
    (
      postId: string,
      voteType: 'rec' | 'nonrec' | null,
      recsCount: number,
      nonRecsCount: number,
    ) => {
      storage.setGalleryData(previous =>
        previous
          ? {
              ...previous,
              posts: previous.posts.map(post =>
                post.id === postId
                  ? {
                      ...post,
                      voted: voteType,
                      recommendations: recsCount,
                      nonRecommendations: nonRecsCount,
                    }
                  : post,
              ),
            }
          : null,
      );
    },
    [storage],
  );

  const voteComment = useCallback(
    (
      postId: string,
      commentId: string,
      voteType: 'rec' | 'nonrec' | null,
      recsCount: number,
      nonRecsCount: number,
    ) => {
      storage.setGalleryData(previous =>
        previous
          ? {
              ...previous,
              posts: previous.posts.map(post =>
                post.id === postId
                  ? {
                      ...post,
                      comments: post.comments.map(comment =>
                        comment.id === commentId
                          ? {
                              ...comment,
                              voted: voteType,
                              recommendations: recsCount,
                              nonRecommendations: nonRecsCount,
                            }
                          : comment,
                      ),
                    }
                  : post,
              ),
            }
          : null,
      );
    },
    [storage],
  );

  const selectedPost = useMemo(() => {
    if (!storage.selectedPostId || !storage.galleryData) return null;
    return storage.galleryData.posts.find(post => post.id === storage.selectedPostId) || null;
  }, [storage.selectedPostId, storage.galleryData]);

  return {
    galleryData: storage.galleryData,
    galleryContext: storage.galleryContext,
    currentUserProfile: storage.currentUserProfile,
    storageWarning: storage.storageWarning,
    selectedPost,
    isLoading: ui.isLoading,
    error: ui.error,
    successMessage: ui.successMessage,
    warningMessage: ui.warningMessage,
    isWriteModalOpen: ui.isWriteModalOpen,
    isSavingUserPost: ui.isSavingUserPost,
    isAddingComment: ui.isAddingComment,
    highlightedCommentIds: ui.highlightedCommentIds,
    streamingText: ui.streamingText,
    generationPhase: ui.generationPhase,
    generationMessage: ui.generationMessage,
    generationProgress: ui.generationProgress,
    worldviewFeedback: ui.worldviewFeedback,
    isFetchingFeedback: ui.isFetchingFeedback,
    createGallery,
    cancelGeneration,
    selectPost: storage.selectPost,
    backToList: storage.backToList,
    openWriteModal: openWriteModalWrapper,
    closeWriteModal: ui.closeWriteModal,
    saveUserPost,
    addUserComment,
    votePost,
    voteComment,
    fetchWorldviewFeedback,
    setError: ui.setError,
  };
};
