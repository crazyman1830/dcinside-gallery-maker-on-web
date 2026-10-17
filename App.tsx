import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GalleryLibrary } from './components/GalleryLibrary';
import { FixedNicknameSettings } from './components/FixedNicknameSettings';
import { WorldlineMemory } from './components/WorldlineMemory';
import { GalleryHeader } from './components/GalleryHeader';
import { PostList } from './components/PostList';
import { PostView } from './components/PostView';
import { WarningMessage } from './components/WarningMessage';
import { NoticeToasts, type Notice } from './components/NoticeToasts';
import { GenerationFailureCard } from './components/GenerationFailureCard';
import { StageWarnings } from './components/StageWarnings';
import { WritePostModal } from './components/WritePostModal';
import { GalleryCreationFormContent } from './components/GalleryCreationForm';
import { GalleryFormProvider } from './context/GalleryFormContext';
import { galleryContextToFormSettings } from './utils/gallerySettings';
import { useGalleryNavigation } from './hooks/useGalleryNavigation';
import { WorldviewFeedback } from './components/WorldviewFeedback';
import { StreamingStatus } from './components/StreamingStatus';
import { useGallery } from './hooks/useGallery';
import { MAX_TOTAL_COMMENTS_PER_POST } from './constants';
import type { CreateGalleryInput, GallerySessionV2, UserProfile } from './types';
import { Icon } from './components/Icon';

type GallerySubmission = CreateGalleryInput & { userProfile: UserProfile };

const secondaryButtonClass =
  'inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';

const focusAfterPaint = (id: string) =>
  requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));

const App: React.FC = () => {
  const {
    galleryData,
    revision,
    openSession,
    saveContinuityNotes,
    saveFixedNicknames,
    retryFailedStages,
    generationFailure,
    dismissGenerationFailure,
    galleryContext,
    currentUserProfile,
    isLoading,
    error,
    successMessage,
    warningMessage,
    storageWarning,
    isWriteModalOpen,
    isSavingUserPost,
    isAddingComment,
    highlightedCommentIds,
    isStreaming,
    generationPhase,
    generationMessage,
    generationProgress,
    worldviewFeedback,
    isFetchingFeedback,
    createGallery,
    cancelGeneration,
    selectPost,
    backToList,
    openWriteModal,
    closeWriteModal,
    saveUserPost,
    addUserComment,
    failedReactionList,
    retryReaction,
    votePost,
    voteComment,
    fetchWorldviewFeedback,
    setError,
    setSuccessMessage,
    setWarningMessage,
  } = useGallery();

  const navigation = useGalleryNavigation(galleryData, galleryContext?.worldlineId, isLoading);
  const { navigate, post: selectedPost } = navigation;
  const view = isLoading ? 'setup' : navigation.view;
  useEffect(() => {
    closeWriteModal();
  }, [navigation.view, selectedPost?.id, closeWriteModal]);
  const [formSeed, setFormSeed] = useState(() => ({
    key: 0,
    settings: galleryContextToFormSettings(galleryContext, currentUserProfile),
  }));
  const libraryRef = useRef<{ saveCurrent: () => Promise<boolean> }>(null);
  const isBusy = isLoading || isSavingUserPost || isAddingComment;

  const handleCreateGallery = useCallback(
    async (params: GallerySubmission) => {
      if (libraryRef.current && !(await libraryRef.current.saveCurrent())) {
        setError(
          '현재 갤러리를 보관하지 못해 새 생성을 시작하지 않았습니다. 보관함 메시지를 확인해주세요.',
        );
        return;
      }
      const pendingResult = createGallery(params);
      requestAnimationFrame(() => {
        document.getElementById('generation-status')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'center',
        });
      });
      const created = await pendingResult;
      if (created) {
        navigate('gallery-list');
        focusAfterPaint('gallery-content-title');
      }
    },
    [createGallery, navigate, setError],
  );

  const handleSelectPost = useCallback(
    (postId: string) => {
      selectPost(postId);
      navigate('post', postId);
      focusAfterPaint('post-title');
    },
    [selectPost, navigate],
  );

  const handleBackToList = useCallback(() => {
    backToList();
    navigate('gallery-list');
    focusAfterPaint('gallery-content-title');
  }, [backToList, navigate]);

  const handleOpenSetup = useCallback(() => {
    backToList();
    navigate('setup');
    focusAfterPaint('setup-title');
  }, [backToList, navigate]);

  const handleSavePost = useCallback(
    async (title: string, author: string, content: string) => {
      const saved = await saveUserPost(title, author, content, id => navigate('post', id));
      if (saved) {
        requestAnimationFrame(() => focusAfterPaint('post-title'));
      }
      return saved;
    },
    [saveUserPost, navigate],
  );

  const handleOpenWriteModal = useCallback(() => {
    setError(null);
    openWriteModal();
  }, [openWriteModal, setError]);

  const handleReturnToGallery = useCallback(() => {
    navigate('gallery-list');
    focusAfterPaint('gallery-content-title');
  }, [navigate]);

  const retryGeneration = useCallback(() => {
    if (!generationFailure) return;
    void createGallery(generationFailure.params, generationFailure.append).then(created => {
      if (created) navigate('gallery-list');
    });
  }, [createGallery, generationFailure, navigate]);

  const isGalleryView = view === 'gallery-list' || view === 'post';
  const currentSession = useMemo<GallerySessionV2 | null>(
    () =>
      galleryData && galleryContext
        ? {
            version: 2,
            revision,
            savedAt: new Date().toISOString(),
            gallery: {
              galleryTitle: galleryData.galleryTitle,
              posts: galleryData.posts,
              ...(galleryData.warnings ? { warnings: galleryData.warnings } : {}),
            },
            context: galleryContext,
            profile: currentUserProfile,
          }
        : null,
    [galleryData, galleryContext, currentUserProfile, revision],
  );

  const notices: Notice[] = [];
  if (successMessage && !error) {
    notices.push({
      id: `success:${successMessage}`,
      tone: 'success',
      message: successMessage,
      onDismiss: () => setSuccessMessage(null),
    });
  }
  if (warningMessage && !error) {
    notices.push({
      id: `warning:${warningMessage}`,
      tone: 'warning',
      message: warningMessage,
      onDismiss: () => setWarningMessage(null),
    });
  }
  // The write dialog and the failure card already show these errors in place.
  if (
    error &&
    !(isWriteModalOpen && galleryData) &&
    !(generationFailure && !isLoading && error === generationFailure.message)
  ) {
    notices.push({
      id: `error:${error}`,
      tone: 'error',
      message: error,
      onDismiss: () => setError(null),
    });
  }

  const generationFailureCard = generationFailure && !isLoading && (
    <GenerationFailureCard
      stage={generationFailure.stage}
      message={generationFailure.message}
      failedAt={generationFailure.failedAt}
      isAppend={generationFailure.append}
      disabled={isBusy}
      onRetry={retryGeneration}
      onDismiss={() => {
        dismissGenerationFailure();
        setError(null);
      }}
    />
  );
  const postWarnings =
    selectedPost && galleryData?.warnings
      ? galleryData.warnings.filter(warning => warning.postId === selectedPost.id)
      : [];

  return (
    <GalleryFormProvider
      key={formSeed.key}
      initialState={formSeed.settings}
      sessionFixedNicknames={galleryContext?.fixedNicknames}
    >
      <NoticeToasts notices={notices} />
      <div className="container mx-auto flex min-h-screen max-w-4xl flex-col p-4 font-sans">
        {view === 'setup' && (
          <header className="space-y-5 py-8 text-center md:py-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 shadow-sm animate-fade-in-up">
              <Icon icon="fas fa-robot" /> AI Community Generator
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 drop-shadow-sm animate-fade-in-up sm:text-5xl md:text-6xl">
              <span className="inline-block">DCInside</span>{' '}
              <span className="inline-block whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                갤러리 생성기
              </span>
            </h1>
            <div className="mx-auto max-w-2xl space-y-2 animate-fade-in-up">
              <p className="text-lg font-medium leading-relaxed text-slate-600 md:text-xl">
                상상하는 모든 주제가 현실적인 커뮤니티로 탄생합니다.
              </p>
              <p className="text-sm font-medium text-slate-600 md:text-base">
                원하는 세계관과 설정을 입력하면 AI가 개념글, 댓글, 여론을 실시간으로
                시뮬레이션합니다.
              </p>
            </div>
          </header>
        )}

        <main className="flex-grow">
          {storageWarning && <WarningMessage message={storageWarning} />}
          <GalleryLibrary
            ref={libraryRef}
            session={currentSession}
            disabled={isBusy}
            onOpen={session => {
              openSession(session);
              setFormSeed(previous => ({
                key: previous.key + 1,
                settings: galleryContextToFormSettings(session.context, session.profile),
              }));
              navigate('gallery-list');
            }}
          />

          {view === 'setup' && (
            <section aria-labelledby="setup-title">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="setup-title"
                  tabIndex={-1}
                  className="text-xl font-bold text-slate-800 outline-none"
                >
                  갤러리 설정
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isLoading}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    onClick={() => {
                      setFormSeed(previous => ({ key: previous.key + 1, settings: {} }));
                      setError(null);
                    }}
                  >
                    <Icon icon="fas fa-undo" className="mr-2" />
                    설정 초기화
                  </button>
                  {galleryData && !isLoading && (
                    <button
                      type="button"
                      onClick={handleReturnToGallery}
                      className={secondaryButtonClass}
                    >
                      <Icon icon="fas fa-arrow-left" className="mr-2" />
                      기존 갤러리로 돌아가기
                    </button>
                  )}
                </div>
              </div>
              {galleryData && !isLoading && galleryContext && !galleryContext.useSearch && (
                <p className="mb-4 rounded-lg bg-slate-200/50 px-3 py-2 text-sm text-slate-600">
                  새로 생성하면 지금 갤러리(
                  <span className="font-semibold text-slate-700">{galleryData.galleryTitle}</span>
                  )는 보관함에 자동으로 보관됩니다.
                </p>
              )}
              <GalleryCreationFormContent
                isLoading={isLoading}
                onSubmit={handleCreateGallery}
                setFormError={setError}
              />
              {isLoading && isStreaming && (
                <StreamingStatus
                  phase={generationPhase}
                  message={generationMessage}
                  reportedProgress={generationProgress}
                  onCancel={cancelGeneration}
                />
              )}
              {generationFailureCard}
            </section>
          )}

          {isGalleryView && galleryData && !isLoading && (
            <section
              className="rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60 animate-fade-in"
              aria-labelledby="gallery-content-title"
            >
              <GalleryHeader
                galleryTitle={galleryData.galleryTitle}
                worldlineId={galleryContext?.worldlineId}
                sources={galleryData.sources}
              />
              <div className="min-h-[500px] rounded-b-2xl bg-slate-50/30 p-4 md:p-6">
                {view === 'post' && selectedPost ? (
                  <>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <h2
                        id="gallery-content-title"
                        tabIndex={-1}
                        className="text-lg font-bold text-slate-800 outline-none"
                      >
                        게시물 보기
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleOpenSetup}
                          className={secondaryButtonClass}
                        >
                          <Icon icon="fas fa-sliders-h" className="mr-2" />
                          현재 설정으로 새 갤러리 만들기
                        </button>
                        <button
                          type="button"
                          onClick={handleBackToList}
                          className={`group ${secondaryButtonClass}`}
                          aria-label="게시물 목록으로 돌아가기"
                        >
                          <Icon
                            icon="fas fa-arrow-left"
                            className="mr-2 transition-transform group-hover:-translate-x-1"
                          />
                          목록으로
                        </button>
                      </div>
                    </div>
                    <StageWarnings
                      warnings={postWarnings}
                      posts={galleryData.posts}
                      listLabel="이 게시물의 생성 경고"
                      retryDisabled={isBusy}
                      onRetry={() => void retryFailedStages(selectedPost.id)}
                    />
                    <PostView
                      post={selectedPost}
                      currentUserProfile={currentUserProfile}
                      onBackToList={handleBackToList}
                      onWritePost={handleOpenWriteModal}
                      onAddComment={addUserComment}
                      isAddingComment={isAddingComment}
                      maxComments={MAX_TOTAL_COMMENTS_PER_POST}
                      highlightedCommentIds={highlightedCommentIds}
                      onVotePost={votePost}
                      onVoteComment={voteComment}
                    />
                    {failedReactionList
                      .filter(failure => failure.postId === selectedPost.id)
                      .map(failure => (
                        <div
                          key={failure.commentId}
                          className="mt-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4"
                          role="status"
                        >
                          <p className="text-sm font-semibold text-slate-800">
                            실패 단계: 사용자 댓글의 AI 후속 반응 ·{' '}
                            {new Date(failure.failedAt).toLocaleTimeString('ko-KR')}
                          </p>
                          <p className="text-sm text-slate-700">
                            대상 댓글:{' '}
                            {
                              selectedPost.comments.find(
                                comment => comment.id === failure.commentId,
                              )?.text
                            }
                          </p>
                          <p className="text-sm text-slate-800">
                            AI 반응 생성 실패: {failure.message}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {failure.reconnect && (
                              <button
                                type="button"
                                className={secondaryButtonClass}
                                onClick={handleOpenSetup}
                              >
                                연결 설정 확인
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isAddingComment || !failure.retryable}
                              className={secondaryButtonClass}
                              onClick={() => void retryReaction(selectedPost.id, failure.commentId)}
                            >
                              AI 반응 다시 생성
                            </button>
                          </div>
                        </div>
                      ))}
                  </>
                ) : (
                  <>
                    {generationFailureCard}
                    <StageWarnings
                      warnings={galleryData.warnings ?? []}
                      posts={galleryData.posts}
                      listLabel="갤러리 생성 경고"
                      retryDisabled={isBusy}
                      onRetry={() => void retryFailedStages()}
                      onSelectPost={handleSelectPost}
                    />
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h2
                        id="gallery-content-title"
                        tabIndex={-1}
                        className="text-lg font-bold text-slate-800 outline-none"
                      >
                        게시물 목록
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {galleryContext && (
                          <FixedNicknameSettings
                            value={galleryContext.fixedNicknames ?? []}
                            onSave={saveFixedNicknames}
                            reservedNickname={
                              currentUserProfile?.nicknameType === 'FIXED'
                                ? currentUserProfile.nickname
                                : undefined
                            }
                            disabled={isBusy}
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleOpenSetup}
                          className={secondaryButtonClass}
                        >
                          <Icon icon="fas fa-sliders-h" className="mr-2" />
                          현재 설정으로 새 갤러리 만들기
                        </button>
                      </div>
                    </div>
                    {galleryContext && !galleryContext.useSearch && (
                      <WorldlineMemory
                        key={galleryContext.worldlineId}
                        notes={galleryContext.continuityNotes ?? ''}
                        currentEvent={galleryContext.discussionContext}
                        disabled={isBusy}
                        onSave={saveContinuityNotes}
                        onContinue={(nextEvent, notes) => {
                          if (!currentUserProfile) return;
                          void createGallery(
                            {
                              ...galleryContext,
                              continuityNotes: notes,
                              discussionContext: nextEvent || galleryContext.discussionContext,
                              userProfile: currentUserProfile,
                            },
                            true,
                          ).then(created => {
                            if (created) navigate('gallery-list');
                          });
                        }}
                      />
                    )}
                    <PostList
                      galleryId={galleryContext?.worldlineId}
                      posts={galleryData.posts}
                      onSelectPost={handleSelectPost}
                      onWritePost={handleOpenWriteModal}
                    />
                  </>
                )}
              </div>
            </section>
          )}

          {view === 'gallery-list' && (
            <WorldviewFeedback
              isVisible={!!galleryData && !isLoading && galleryContext?.worldviewValue === 'CUSTOM'}
              isFetching={isFetchingFeedback}
              feedback={worldviewFeedback}
              onFetchFeedback={fetchWorldviewFeedback}
            />
          )}

          {galleryData && (
            <WritePostModal
              isOpen={isWriteModalOpen}
              currentUserProfile={currentUserProfile}
              onClose={closeWriteModal}
              onSave={handleSavePost}
              isSaving={isSavingUserPost}
              submissionError={error}
            />
          )}
        </main>

        <footer className="mt-16 border-t border-slate-200/60 py-8 text-center text-sm text-slate-600">
          <p className="mb-2 font-medium">&copy; {new Date().getFullYear()} AI Gallery Generator</p>
          <p className="text-xs">Powered by Gemini API &amp; Google Cloud Vertex AI</p>
        </footer>
      </div>
    </GalleryFormProvider>
  );
};

export default App;
