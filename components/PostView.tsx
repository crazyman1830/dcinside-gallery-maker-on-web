
import React from 'react';
import { Post, UserProfile } from '../types';
import { CommentSection } from './CommentSection';
import { useVoting } from '../hooks/useVoting';

interface PostViewProps {
  post: Post;
  currentUserProfile: UserProfile | null;
  onBackToList?: () => void;
  onWritePost?: () => void;
  onAddComment: (postId: string, commentText: string, commentAuthor: string, parentId?: string) => Promise<void>;
  isAddingComment: boolean;
  maxComments: number;
  highlightedCommentIds: Set<string>;
}

const PostContentRenderer: React.FC<{ content: string }> = ({ content }) => {
    // Regex to match (Type: description) patterns. 
    // Types: 사진 (Photo), 동영상 (Video), 콘 (Emoticon)
    const mediaRegex = /\((사진|동영상|콘):\s*([^\)]+)\)/g;
    
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mediaRegex.exec(content)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
            const textPart = content.substring(lastIndex, match.index);
            parts.push(<span key={`text-${lastIndex}`} className="whitespace-pre-line">{textPart}</span>);
        }

        const type = match[1]; // 사진, 동영상, or 콘
        const description = match[2].trim();

        if (type === '동영상') {
            parts.push(
                <div key={`media-${match.index}`} className="relative w-full max-w-xl mx-auto my-8 rounded-xl bg-slate-900 aspect-video flex flex-col items-center justify-center text-white shadow-lg overflow-hidden group select-none ring-1 ring-white/10">
                    {/* Fake Video UI Overlay */}
                    <div className="absolute top-0 left-0 w-full p-4 bg-gradient-to-b from-black/60 to-transparent z-10">
                        <p className="text-sm font-medium text-white/90 whitespace-pre-wrap break-words flex items-start leading-snug">
                            <i className="fas fa-film mr-2 text-white/70 mt-0.5 flex-shrink-0"></i>
                            <span>{description}</span>
                        </p>
                    </div>
                    
                    {/* Play Button */}
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-white/20 transition-all duration-300 cursor-pointer z-20 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                         <i className="fas fa-play text-2xl opacity-90 text-white pl-1"></i>
                    </div>
                    
                    {/* Fake Progress Bar */}
                    <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/80 to-transparent z-10 flex items-center gap-3">
                         <i className="fas fa-play text-[10px] opacity-70"></i>
                         <div className="h-1 bg-white/20 flex-1 rounded-full overflow-hidden relative">
                            <div className="absolute h-full w-1/3 bg-red-600 rounded-full"></div>
                         </div>
                         <span className="text-[10px] opacity-70 font-mono tracking-wider">00:00 / 03:24</span>
                         <i className="fas fa-volume-up text-xs opacity-70"></i>
                         <i className="fas fa-expand text-xs opacity-70"></i>
                    </div>
                </div>
            );
        } else if (type === '콘') {
            parts.push(
                <div key={`media-${match.index}`} className="inline-flex flex-col items-center justify-center w-24 h-24 sm:w-32 sm:h-32 m-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-2 relative overflow-hidden group select-none cursor-help" title={`디시콘: ${description}`}>
                     <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                     <div className="flex-1 flex items-center justify-center">
                        <i className="far fa-grin-squint text-4xl sm:text-5xl text-yellow-400 group-hover:scale-110 transition-transform duration-200 transform -rotate-6 group-hover:rotate-0"></i>
                     </div>
                     <span className="text-[10px] text-slate-400 group-hover:text-slate-600 text-center leading-tight font-medium break-words w-full px-1 z-10 mt-1 line-clamp-2">
                        {description}
                     </span>
                </div>
            );
        } else {
            // Photo
            parts.push(
                <div key={`media-${match.index}`} className="relative w-full max-w-lg mx-auto my-8 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 aspect-[4/3] sm:aspect-video flex flex-col items-center justify-center text-slate-400 shadow-inner group overflow-hidden select-none hover:bg-slate-100/50 transition-colors">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
                    <i className="fas fa-image text-5xl mb-3 opacity-30 group-hover:opacity-50 group-hover:scale-110 transition-all duration-300"></i>
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-40 mb-2">Image Placeholder</span>
                    <div className="px-4 py-2 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm z-10 max-w-[90%]">
                        <p className="text-sm font-medium text-slate-600 text-center break-words whitespace-pre-wrap leading-snug">"{description}"</p>
                    </div>
                </div>
            );
        }

        lastIndex = mediaRegex.lastIndex;
    }

    // Remaining text
    if (lastIndex < content.length) {
        parts.push(<span key={`text-${lastIndex}`} className="whitespace-pre-line">{content.substring(lastIndex)}</span>);
    }

    return <div className="text-slate-800 text-base md:text-lg leading-relaxed break-all min-h-[150px] font-sans">{parts}</div>;
};

export const PostView: React.FC<PostViewProps> = ({
    post,
    currentUserProfile,
    onBackToList,
    onWritePost,
    onAddComment,
    isAddingComment,
    maxComments,
    highlightedCommentIds
}) => {
  const { recs, nonRecs, voted, handleRecommend, handleNonRecommend } = useVoting(post.recommendations, post.nonRecommendations);

  return (
    <div className="animate-fade-in-up">
      <article className="bg-white p-1 md:p-2 rounded-xl">
        {/* Header Section */}
        <header className="mb-8 pb-6 border-b border-slate-100">
            <div className="flex items-start gap-3 mb-4">
                 {post.isBestPost && (
                    <div className="mt-1.5 flex-shrink-0">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 shadow-sm ring-1 ring-amber-200 animate-pulse">
                            <i className="fas fa-crown text-sm"></i>
                        </span>
                    </div>
                 )}
                <h3 className="text-2xl md:text-3xl font-bold text-slate-800 leading-tight break-words tracking-tight">
                    {post.title}
                </h3>
            </div>
            
            <div className="flex flex-wrap items-center justify-between text-sm text-slate-500 bg-slate-50 px-4 py-3 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 group cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors">
                            <i className="fas fa-user text-xs"></i>
                        </div>
                        <span className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{post.author}</span>
                    </div>
                    <div className="h-3 w-[1px] bg-slate-300"></div>
                    <span className="font-mono text-xs text-slate-400">{post.timestamp}</span>
                </div>
                <div className="flex items-center gap-3 mt-3 sm:mt-0 w-full sm:w-auto justify-end">
                    <span title="조회수" className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-xs"><i className="far fa-eye text-slate-400"></i> {post.views.toLocaleString()}</span>
                    <span title="추천수" className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-xs text-red-500 font-medium"><i className="far fa-thumbs-up"></i> {post.recommendations}</span>
                    <span title="댓글수" className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-xs text-blue-500 font-medium"><i className="far fa-comment-dots"></i> {post.comments.length}</span>
                </div>
            </div>
        </header>

        {/* Content Section */}
        <div className="prose prose-lg prose-slate max-w-none mb-16 px-1">
            <PostContentRenderer content={post.content} />
        </div>

        {/* Action Buttons */}
        <div className="mb-12 flex flex-col items-center gap-4 select-none">
            <div className="flex items-center gap-4 sm:gap-6">
                <button
                    onClick={handleRecommend}
                    className={`group relative flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 transition-all duration-200
                    ${voted === 'rec' 
                        ? 'bg-red-50 border-red-500 text-red-600 shadow-inner scale-95' 
                        : 'bg-white border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50/30 hover:text-red-500 shadow-sm hover:shadow-md hover:-translate-y-1'}`}
                    aria-label={`추천 ${recs.toLocaleString()}개`}
                >
                    <i className="fas fa-thumbs-up text-2xl sm:text-3xl mb-1 sm:mb-2 transform group-hover:scale-110 transition-transform duration-300"></i>
                    <span className="text-lg sm:text-xl font-bold font-mono tracking-tight">{recs}</span>
                    <span className={`absolute -bottom-8 text-sm font-medium transition-all duration-300 ${voted === 'rec' ? 'text-red-600 opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2'}`}>개념글</span>
                </button>

                <button
                    onClick={handleNonRecommend}
                    className={`group relative flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 transition-all duration-200
                    ${voted === 'nonrec' 
                        ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-inner scale-95' 
                        : 'bg-white border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-500 shadow-sm hover:shadow-md hover:-translate-y-1'}`}
                    aria-label={`비추천 ${nonRecs.toLocaleString()}개`}
                >
                    <i className="fas fa-thumbs-down text-2xl sm:text-3xl mb-1 sm:mb-2 transform group-hover:scale-110 transition-transform duration-300"></i>
                    <span className="text-lg sm:text-xl font-bold font-mono tracking-tight">{nonRecs}</span>
                    <span className={`absolute -bottom-8 text-sm font-medium transition-all duration-300 ${voted === 'nonrec' ? 'text-blue-600 opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2'}`}>비추</span>
                </button>
            </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between border-t border-slate-100 pt-8">
            {onBackToList && (
                <button
                    onClick={onBackToList}
                    className="px-4 sm:px-5 py-2.5 rounded-lg font-medium bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 transition-all duration-200 flex items-center gap-2 shadow-sm"
                >
                    <i className="fas fa-list text-slate-400"></i> 목록으로
                </button>
            )}
            {onWritePost && (
                <button
                    onClick={onWritePost}
                    className="px-4 sm:px-5 py-2.5 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:-translate-y-0.5"
                >
                    <i className="fas fa-pen"></i> 글쓰기
                </button>
            )}
        </div>
      </article>
      
      <div className="mt-8">
        <CommentSection
            postId={post.id}
            comments={post.comments}
            currentUserProfile={currentUserProfile}
            onAddComment={onAddComment}
            isAddingComment={isAddingComment}
            maxComments={maxComments}
            currentCommentCount={post.comments.length}
            highlightedCommentIds={highlightedCommentIds}
        />
      </div>
    </div>
  );
};
