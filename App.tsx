import React, { useCallback, useEffect, useState } from 'react';
import { GalleryHeader } from './components/GalleryHeader';
import { PostList } from './components/PostList';
import { PostView } from './components/PostView';
import { ErrorMessage } from './components/ErrorMessage';
import { SuccessMessage } from './components/SuccessMessage';
import { WarningMessage } from './components/WarningMessage';
import { WritePostModal } from './components/WritePostModal';
import { GalleryCreationForm } from './components/GalleryCreationForm';
import { WorldviewFeedback } from './components/WorldviewFeedback';
import { StreamingStatus } from './components/StreamingStatus';
import { useGallery } from './hooks/useGallery';
import { MAX_TOTAL_COMMENTS_PER_POST } from './constants';
import type { AppView, CreateGalleryParams, UserProfile } from './types';

type GallerySubmission = CreateGalleryParams & { userProfile: UserProfile };

const App: React.FC = () => {
  const {
    galleryData,
    galleryContext,
    currentUserProfile,
    isLoading,
    error,
    successMessage,
    warningMessage,
    storageWarning,
    selectedPost,
    isWriteModalOpen,
    isSavingUserPost,
    isAddingComment,
    highlightedCommentIds,
    streamingText,
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
    votePost,
    voteComment,
    fetchWorldviewFeedback,
    setError,
  } = useGallery();

  const [view, setView] = useState<AppView>(() => (galleryData ? 'gallery-list' : 'setup'));

  useEffect(() => {
    if (!galleryData && !isLoading) setView('setup');
  }, [galleryData, isLoading]);

  useEffect(() => {
    if (view === 'post' && !selectedPost) setView(galleryData ? 'gallery-list' : 'setup');
  }, [galleryData, selectedPost, view]);

  const handleCreateGallery = useCallback(
    async (params: GallerySubmission) => {
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
        setView('gallery-list');
        requestAnimationFrame(() => document.getElementById('gallery-content-title')?.focus());
      }
    },
    [createGallery],
  );

  const handleSelectPost = useCallback(
    (postId: string) => {
      selectPost(postId);
      setView('post');
      requestAnimationFrame(() => document.getElementById('post-title')?.focus());
    },
    [selectPost],
  );

  const handleBackToList = useCallback(() => {
    backToList();
    setView('gallery-list');
    requestAnimationFrame(() => document.getElementById('gallery-content-title')?.focus());
  }, [backToList]);

  const handleOpenSetup = useCallback(() => {
    backToList();
    setView('setup');
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(() => document.getElementById('setup-title')?.focus());
  }, [backToList]);

  const handleSavePost = useCallback(
    async (title: string, author: string, content: string) => {
      const saved = await saveUserPost(title, author, content);
      if (saved) {
        setView('post');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => document.getElementById('post-title')?.focus());
        });
      }
      return saved;
    },
    [saveUserPost],
  );

  const handleOpenWriteModal = useCallback(() => {
    setError(null);
    openWriteModal();
  }, [openWriteModal, setError]);

  const handleReturnToGallery = useCallback(() => {
    setView('gallery-list');
    requestAnimationFrame(() => document.getElementById('gallery-content-title')?.focus());
  }, []);

  const isGalleryView = view === 'gallery-list' || view === 'post';

  return (
    <div className="container mx-auto flex min-h-screen max-w-4xl flex-col p-4 font-sans">
      {view === 'setup' && (
        <header className="space-y-5 py-10 text-center md:py-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 shadow-sm animate-fade-in-up">
            <i className="fas fa-robot" aria-hidden="true" /> AI Community Generator
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
              원하는 세계관과 설정을 입력하면 AI가 개념글, 댓글, 여론을 실시간으로 시뮬레이션합니다.
            </p>
          </div>
        </header>
      )}

      <main className="flex-grow">
        {successMessage && !error && <SuccessMessage message={successMessage} />}
        {warningMessage && !error && <WarningMessage message={warningMessage} />}
        {storageWarning && <WarningMessage message={storageWarning} />}
        {error && <ErrorMessage message={error} />}

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
              {galleryData && !isLoading && (
                <button
                  type="button"
                  onClick={handleReturnToGallery}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <i className="fas fa-arrow-left mr-2" aria-hidden="true" />
                  기존 갤러리로 돌아가기
                </button>
              )}
            </div>
            <GalleryCreationForm
              isLoading={isLoading}
              onSubmit={handleCreateGallery}
              setFormError={setError}
            />
            {isLoading && streamingText !== null && (
              <StreamingStatus
                phase={generationPhase}
                message={generationMessage}
                reportedProgress={generationProgress}
                onCancel={cancelGeneration}
              />
            )}
          </section>
        )}

        {isGalleryView && galleryData && !isLoading && (
          <section
            className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60 animate-fade-in"
            aria-labelledby="gallery-content-title"
          >
            <GalleryHeader galleryTitle={galleryData.galleryTitle} sources={galleryData.sources} />
            <div className="min-h-[500px] bg-slate-50/30 p-4 md:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="gallery-content-title"
                  tabIndex={-1}
                  className="text-lg font-bold text-slate-800 outline-none"
                >
                  {view === 'post' ? '게시물 보기' : '게시물 목록'}
                </h2>
                <button
                  type="button"
                  onClick={handleOpenSetup}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <i className="fas fa-sliders-h mr-2" aria-hidden="true" />새 갤러리 / 설정
                </button>
              </div>

              {view === 'post' && selectedPost ? (
                <>
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="group mb-6 flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label="게시물 목록으로 돌아가기"
                  >
                    <i
                      className="fas fa-arrow-left mr-2 transition-transform group-hover:-translate-x-1"
                      aria-hidden="true"
                    />{' '}
                    목록으로
                  </button>
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
                </>
              ) : (
                <PostList
                  posts={galleryData.posts}
                  onSelectPost={handleSelectPost}
                  onWritePost={handleOpenWriteModal}
                />
              )}
            </div>
          </section>
        )}

        {isGalleryView && (
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
  );
};

export default App;
