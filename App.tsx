
import React from 'react';
import { GalleryHeader } from './components/GalleryHeader';
import { PostList } from './components/PostList';
import { PostView } from './components/PostView';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { SuccessMessage } from './components/SuccessMessage';
import { WritePostModal } from './components/WritePostModal';
import { GalleryCreationForm } from './components/GalleryCreationForm';
import { WorldviewFeedback } from './components/WorldviewFeedback';
import { StreamingStatus } from './components/StreamingStatus';
import { useGallery } from './hooks/useGallery';
import { isApiKeyAvailable } from './services/galleryService';
import { MAX_TOTAL_COMMENTS_PER_POST } from './constants';

const App: React.FC = () => {
    const {
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
    } = useGallery();

    return (
        <div className="container mx-auto p-4 max-w-4xl font-sans min-h-screen flex flex-col">
            <header className="py-12 md:py-16 text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold tracking-wide uppercase shadow-sm animate-fade-in-up">
                    <i className="fas fa-robot"></i> AI Community Generator
                </div>
                
                <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight animate-fade-in-up delay-100 drop-shadow-sm">
                    DCInside <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">갤러리 생성기</span>
                </h1>
                
                <div className="max-w-2xl mx-auto space-y-2 animate-fade-in-up delay-200">
                    <p className="text-lg md:text-xl text-slate-600 font-medium leading-relaxed">
                        상상하는 모든 주제가 현실적인 커뮤니티로 탄생합니다.
                    </p>
                    <p className="text-slate-500 text-sm md:text-base font-medium">
                        원하는 세계관과 설정을 입력하면 AI가 개념글, 댓글, 여론을 실시간으로 시뮬레이션합니다.
                    </p>
                </div>
            </header>

            <main className="flex-grow">
                {error && error === API_KEY_MISSING_APP_ERROR_MESSAGE && <ErrorMessage message={error} />}

                {!selectedPost && (
                    <GalleryCreationForm
                        isLoading={isLoading}
                        isApiKeyAvailable={isApiKeyAvailable}
                        onSubmit={createGallery}
                        setFormError={setError}
                    />
                )}

                {/* Streaming Visualization */}
                {isLoading && streamingText !== null && (
                    <StreamingStatus streamingText={streamingText} />
                )}
                
                {isLoading && streamingText === null && <div className="flex justify-center my-8" aria-label="갤러리 생성 중"><LoadingSpinner /></div>}


                {successMessage && !error && <SuccessMessage message={successMessage} />}
                {error && error !== API_KEY_MISSING_APP_ERROR_MESSAGE && <ErrorMessage message={error} />}

                {galleryData && !isLoading && (
                    <div className="bg-white shadow-xl shadow-slate-200/60 rounded-2xl overflow-hidden border border-slate-100 animate-fade-in">
                        <GalleryHeader galleryTitle={galleryData.galleryTitle} />
                        <div className="p-4 md:p-6 bg-slate-50/30 min-h-[500px]">
                            {selectedPost ? (
                                <>
                                    <button onClick={backToList} className="mb-6 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-semibold py-2.5 px-4 rounded-xl transition duration-200 flex items-center shadow-sm group" aria-label="게시물 목록으로 돌아가기">
                                        <i className="fas fa-arrow-left mr-2 group-hover:-translate-x-1 transition-transform"></i> 목록으로
                                    </button>
                                    <PostView
                                        post={selectedPost}
                                        currentUserProfile={currentUserProfile}
                                        onBackToList={backToList}
                                        onWritePost={openWriteModal}
                                        onAddComment={addUserComment}
                                        isAddingComment={isAddingComment}
                                        maxComments={MAX_TOTAL_COMMENTS_PER_POST}
                                        highlightedCommentIds={highlightedCommentIds}
                                    />
                                </>
                            ) : (
                                <PostList
                                    posts={galleryData.posts}
                                    onSelectPost={selectPost}
                                    onWritePost={openWriteModal}
                                />
                            )}
                        </div>
                    </div>
                )}

                <WorldviewFeedback
                    isVisible={!!galleryData && !isLoading && galleryContext?.worldviewValue === 'CUSTOM'}
                    isFetching={isFetchingFeedback}
                    feedback={worldviewFeedback}
                    onFetchFeedback={fetchWorldviewFeedback}
                />

                {isWriteModalOpen && galleryData && (
                    <WritePostModal
                        isOpen={isWriteModalOpen}
                        currentUserProfile={currentUserProfile}
                        onClose={closeWriteModal}
                        onSave={saveUserPost}
                        isSaving={isSavingUserPost}
                    />
                )}
            </main>

            <footer className="mt-16 py-8 text-center text-sm text-slate-400 border-t border-slate-200/60">
                <p className="mb-2 font-medium">&copy; {new Date().getFullYear()} AI Gallery Generator</p>
                <p className="text-xs">Powered by Google Gemini API</p>
            </footer>
        </div>
    );
};

export default App;
