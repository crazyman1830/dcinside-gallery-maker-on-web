import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../services/apiError';
import {
  type AsyncJob,
  type AsyncJobKind,
  Comment,
  type CreateGalleryInput,
  type CreateGalleryRequest,
  type GalleryContextParams,
  type GallerySessionV2,
  type FixedNickname,
  type ReactionFailure,
  UserProfile,
  type ReplyTarget,
} from '../types';
import * as galleryService from '../services/galleryService';
import { createTimestamp, getFormattedErrorMessage, timestampToEpoch } from '../utils/common';
import { createWorldlineId } from '../utils/worldline';
import { MAX_TOTAL_COMMENTS_PER_POST, POST_AUTHOR_PREFIX } from '../constants';
import { useGalleryStorage } from './useGalleryStorage';
import { fixedNicknamesSchema } from '../schemas';
import { useUIState } from './useUIState';

interface ExtendedCreateGalleryParams extends CreateGalleryInput {
  userProfile: UserProfile;
}

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError');

const makeReactionFailure = (error: unknown): ReactionFailure => ({
  message: getFormattedErrorMessage(error).slice(0, 1000),
  retryAt: Date.now() + (error instanceof ApiError ? (error.retryAfterSeconds ?? 0) * 1000 : 0),
  reconnect: error instanceof ApiError && (error.status === 401 || error.status === 403),
  retryable:
    !(error instanceof ApiError) ||
    error.retryable !== false ||
    error.status === 401 ||
    error.status === 403,
  failedAt: createTimestamp(),
});

export const useGallery = () => {
  const storage = useGalleryStorage();
  const ui = useUIState();
  const failedReactionList = useMemo(
    () =>
      (storage.galleryData?.posts ?? []).flatMap(post =>
        post.comments.flatMap(comment =>
          comment.reactionFailure
            ? [{ ...comment.reactionFailure, postId: post.id, commentId: comment.id }]
            : [],
        ),
      ),
    [storage.galleryData],
  );
  // Keep the first failure available for existing callers; the UI lists every failed comment.
  const failedReactions = useMemo(
    () =>
      Object.fromEntries(
        [...failedReactionList].reverse().map(failure => [failure.postId, failure]),
      ),
    [failedReactionList],
  );
  const [generationFailure, setGenerationFailure] = useState<{
    params: ExtendedCreateGalleryParams;
    append: boolean;
    stage: string;
    message: string;
    failedAt: string;
  } | null>(null);
  const setReactionFailure = useCallback(
    (postId: string, commentId: string, failure: ReactionFailure) => {
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
                          ? { ...comment, reactionFailure: failure }
                          : comment,
                      ),
                    }
                  : post,
              ),
            }
          : previous,
      );
    },
    [storage],
  );

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
    async (params: ExtendedCreateGalleryParams, append = false): Promise<boolean> => {
      if (
        append &&
        (!storage.galleryData || !storage.galleryContext || storage.galleryContext.useSearch)
      )
        return false;
      if (append && storage.galleryData!.posts.length > 195) {
        ui.setError('갤러리에는 최대 200개의 글을 보관할 수 있습니다. 새 갤러리를 만들어주세요.');
        return false;
      }
      generationRequestRef.current?.abortController.abort();
      abortSessionRequests();

      const request = makeRequest('gallery');
      generationRequestRef.current = request;
      ui.resetForNewGeneration();
      setGenerationFailure(null);
      let failedStage = '게시글 생성';

      const isCurrent = () => generationRequestRef.current?.requestId === request.requestId;

      try {
        const worldlineId = append ? storage.galleryContext!.worldlineId : createWorldlineId();
        const generationParams: CreateGalleryRequest & { userProfile: UserProfile } = {
          ...params,
          ...(append
            ? {
                continuationContext: galleryService.buildGalleryContinuationContext(
                  storage.galleryData!,
                ),
              }
            : {}),
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
            failedStage =
              phase === 'gallery'
                ? '게시글 생성'
                : phase === 'posts'
                  ? '반응 수치·댓글 생성'
                  : '결과 수신';
            ui.setGenerationPhase(phase);
            if (message) ui.setGenerationMessage(message);
            if (typeof progress === 'number') ui.setGenerationProgress(progress);
          },
        );

        if (!isCurrent()) return false;

        // The previous session remains untouched until a complete result exists.
        // These synchronous state updates are batched into a single commit.
        sessionRevisionRef.current = storage.revision + 1;
        const galleryContext: GalleryContextParams = { ...params, worldlineId };
        const finalData = append
          ? {
              ...storage.galleryData!,
              posts: [
                ...data.posts.filter(
                  post => !storage.galleryData!.posts.some(existing => existing.id === post.id),
                ),
                ...storage.galleryData!.posts,
              ],
              warnings: [...(storage.galleryData!.warnings ?? []), ...(data.warnings ?? [])].slice(
                -100,
              ),
            }
          : data;
        storage.replaceSession(finalData, galleryContext, generationParams.userProfile);

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
          setGenerationFailure({
            params,
            append,
            stage: failedStage,
            message: getFormattedErrorMessage(error),
            failedAt: createTimestamp(),
          });
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
    async (
      title: string,
      author: string,
      content: string,
      onCreated?: (postId: string) => void,
    ): Promise<boolean> => {
      if (!storage.galleryData || !storage.galleryContext) {
        ui.setError('오류: 갤러리 데이터 또는 컨텍스트가 없습니다. 글을 저장할 수 없습니다.');
        return false;
      }
      if (storage.galleryData.posts.length >= 200) {
        ui.setError('갤러리에는 최대 200개의 글을 작성할 수 있습니다.');
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
          previous
            ? {
                ...previous,
                posts: [finalNewPost, ...previous.posts],
                warnings: [...(previous.warnings ?? []), ...postWarnings].slice(-100),
              }
            : null,
        );
        ui.closeWriteModal();
        storage.setSelectedPostId(finalNewPost.id);
        onCreated?.(finalNewPost.id);
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
      if (commentRequestRef.current) return;
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
          setReactionFailure(postId, newUserComment.id, makeReactionFailure(error));
        }
      } finally {
        if (commentRequestRef.current?.requestId === request.requestId) {
          commentRequestRef.current = null;
          ui.setIsAddingComment(false);
          ui.triggerCommentHighlight(newCommentIdsToHighlight);
        }
      }
    },
    [makeRequest, storage, ui, setReactionFailure],
  );

  const retryReaction = useCallback(
    async (postId: string, commentId?: string) => {
      const failure = commentId
        ? failedReactionList.find(item => item.postId === postId && item.commentId === commentId)
        : failedReactions[postId];
      const post = storage.galleryData?.posts.find(candidate => candidate.id === postId);
      if (
        !failure ||
        !failure.retryable ||
        !post ||
        !storage.galleryContext ||
        commentRequestRef.current
      )
        return;
      if (Date.now() < failure.retryAt) {
        ui.setWarningMessage('요청 제한 대기 시간이 지나면 다시 시도해주세요.');
        return;
      }
      if (post.comments.length >= MAX_TOTAL_COMMENTS_PER_POST) {
        ui.setWarningMessage('댓글 상한에 도달해 AI 응답을 추가할 수 없습니다.');
        return;
      }
      const index = post.comments.findIndex(comment => comment.id === failure.commentId);
      if (index === -1) return;
      const request = makeRequest('follow-up');
      commentRequestRef.current = request;
      ui.setIsAddingComment(true);
      ui.setError(null);
      const isCurrent = () =>
        commentRequestRef.current?.requestId === request.requestId &&
        request.sessionRevision === sessionRevisionRef.current;
      try {
        const comments = await galleryService.addFollowUpComments(
          post,
          post.comments.slice(0, index + 1),
          storage.galleryContext,
          storage.galleryContext.selectedModel,
          request.abortController.signal,
          post.comments.length,
        );
        if (!isCurrent()) return;
        storage.setGalleryData(previous =>
          !previous || request.sessionRevision !== sessionRevisionRef.current
            ? previous
            : {
                ...previous,
                posts: previous.posts.map(current => {
                  if (current.id !== postId) return current;
                  const ids = new Set(current.comments.map(comment => comment.id));
                  const added = comments.filter(comment => {
                    if (ids.has(comment.id)) return false;
                    ids.add(comment.id);
                    return true;
                  });
                  return {
                    ...current,
                    comments: [
                      ...current.comments.map(comment => {
                        if (comment.id !== failure.commentId) return comment;
                        const { reactionFailure: _failure, ...rest } = comment;
                        return rest;
                      }),
                      ...added,
                    ].slice(0, MAX_TOTAL_COMMENTS_PER_POST),
                  };
                }),
              },
        );
        ui.setWarningMessage(null);
        ui.setSuccessMessage('AI 반응을 다시 생성했습니다.');
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return;
        setReactionFailure(postId, failure.commentId, makeReactionFailure(error));
      } finally {
        if (isCurrent()) {
          commentRequestRef.current = null;
          ui.setIsAddingComment(false);
        }
      }
    },
    [failedReactions, failedReactionList, makeRequest, storage, ui, setReactionFailure],
  );

  const retryFailedStage = useCallback(
    async (postId: string, stage: 'evaluation' | 'comments'): Promise<boolean> => {
      const original = storage.galleryData?.posts.find(post => post.id === postId);
      if (
        !original ||
        !storage.galleryContext ||
        commentRequestRef.current ||
        generationRequestRef.current ||
        postRequestRef.current
      )
        return false;
      const request = makeRequest('follow-up');
      commentRequestRef.current = request;
      ui.setIsAddingComment(true);
      ui.setError(null);
      const isCurrent = () =>
        commentRequestRef.current?.requestId === request.requestId &&
        request.sessionRevision === sessionRevisionRef.current;
      try {
        const result = await galleryService.retryPostStage(
          original,
          stage,
          storage.galleryContext,
          request.abortController.signal,
        );
        if (!isCurrent()) return false;
        storage.setGalleryData(previous => {
          if (!previous || request.sessionRevision !== sessionRevisionRef.current) return previous;
          return {
            ...previous,
            warnings: [
              ...(previous.warnings ?? []).filter(
                warning => warning.postId !== postId || warning.stage !== stage,
              ),
              ...result.warnings,
            ].slice(-100),
            posts: previous.posts.map(current => {
              if (current.id !== postId || result.warnings.length) return current;
              if (stage === 'evaluation')
                return {
                  ...current,
                  views: result.post.views,
                  recommendations: Math.max(
                    0,
                    result.post.recommendations +
                      current.recommendations -
                      original.recommendations,
                  ),
                  nonRecommendations: Math.max(
                    0,
                    result.post.nonRecommendations +
                      current.nonRecommendations -
                      original.nonRecommendations,
                  ),
                };
              const originalIds = new Set(original.comments.map(comment => comment.id));
              const returnedIds = new Set(result.post.comments.map(comment => comment.id));
              const currentIds = new Set(current.comments.map(comment => comment.id));
              return {
                ...current,
                comments: [
                  ...current.comments.filter(
                    comment => !originalIds.has(comment.id) || returnedIds.has(comment.id),
                  ),
                  ...result.post.comments.filter(comment => !currentIds.has(comment.id)),
                ].slice(0, MAX_TOTAL_COMMENTS_PER_POST),
              };
            }),
          };
        });
        if (result.warnings.length)
          ui.setWarningMessage('해당 단계에서 다시 실패했습니다. 실패 기록을 확인해주세요.');
        else {
          ui.setWarningMessage(null);
          ui.setSuccessMessage(
            `${stage === 'evaluation' ? '반응 수치 평가' : '댓글 생성'} 단계를 복구했습니다.`,
          );
        }
        return result.warnings.length === 0;
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return false;
        const message = getFormattedErrorMessage(error);
        storage.setGalleryData(previous =>
          previous
            ? {
                ...previous,
                warnings: (previous.warnings ?? []).map(warning =>
                  warning.postId === postId && warning.stage === stage
                    ? { ...warning, message }
                    : warning,
                ),
              }
            : previous,
        );
        ui.setWarningMessage(message);
        return false;
      } finally {
        if (isCurrent()) {
          commentRequestRef.current = null;
          ui.setIsAddingComment(false);
        }
      }
    },
    [storage, ui, makeRequest],
  );

  const retryFailedStages = useCallback(async () => {
    const failures = (storage.galleryData?.warnings ?? []).filter(
      warning => warning.postId && (warning.stage === 'evaluation' || warning.stage === 'comments'),
    );
    const visited = new Set<string>();
    for (const failure of failures) {
      const key = `${failure.postId}:${failure.stage}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!(await retryFailedStage(failure.postId!, failure.stage as 'evaluation' | 'comments')))
        break;
    }
  }, [storage.galleryData, retryFailedStage]);

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

  const openSession = useCallback(
    (session: GallerySessionV2) => {
      generationRequestRef.current?.abortController.abort();
      generationRequestRef.current = null;
      abortSessionRequests();
      sessionRevisionRef.current = storage.revision + 1;
      storage.replaceSession(session.gallery, session.context, session.profile);
      setGenerationFailure(null);
      ui.closeWriteModal();
      ui.setIsLoading(false);
      ui.setStreamingText(null);
      ui.setError(null);
      ui.setWarningMessage(null);
      ui.setWorldviewFeedback(null);
      ui.setSuccessMessage('보관한 갤러리를 열었습니다.');
    },
    [abortSessionRequests, storage, ui],
  );

  const saveContinuityNotes = useCallback(
    (notes: string) => {
      if (!storage.galleryContext || notes.length > 2000) return;
      abortSessionRequests();
      sessionRevisionRef.current = storage.revision + 1;
      storage.setGalleryContext({ ...storage.galleryContext, continuityNotes: notes.trim() });
      ui.setSuccessMessage('세계관 메모를 저장했습니다.');
    },
    [abortSessionRequests, storage, ui],
  );

  const saveFixedNicknames = useCallback(
    (entries: FixedNickname[]) => {
      const parsed = fixedNicknamesSchema.safeParse(entries);
      if (!parsed.success || !storage.galleryContext) return;
      if (
        storage.currentUserProfile?.nicknameType === 'FIXED' &&
        parsed.data.some(
          entry =>
            entry.nickname.toLocaleLowerCase() ===
            storage.currentUserProfile!.nickname.toLocaleLowerCase(),
        )
      ) {
        ui.setError('내 닉네임과 AI 고정닉 이름은 달라야 합니다.');
        return;
      }
      abortSessionRequests();
      sessionRevisionRef.current = storage.revision + 1;
      storage.setGalleryContext({ ...storage.galleryContext, fixedNicknames: parsed.data });
      ui.setSuccessMessage('고정닉 설정을 저장했습니다. 다음 생성부터 반영됩니다.');
    },
    [storage, ui, abortSessionRequests],
  );

  return {
    galleryData: storage.galleryData,
    revision: storage.revision,
    openSession,
    saveContinuityNotes,
    saveFixedNicknames,
    retryFailedStage,
    retryFailedStages,
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
    failedReactions,
    failedReactionList,
    generationFailure,
    retryReaction,
    votePost,
    voteComment,
    fetchWorldviewFeedback,
    setError: ui.setError,
  };
};
