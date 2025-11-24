
import React, { useState, useRef, useEffect } from 'react';
import { Comment, UserProfile } from '../types';
import { CommentItem } from './CommentItem';
import { LoadingSpinner } from './LoadingSpinner';
import { MAX_COMMENT_AUTHOR_LENGTH } from '../constants';
import { resolveUserNickname } from '../utils/common';

interface CommentSectionProps {
  postId: string;
  comments: Comment[];
  currentUserProfile: UserProfile | null;
  onAddComment: (postId: string, commentText: string, commentAuthor: string) => Promise<void>;
  isAddingComment: boolean;
  maxComments: number;
  currentCommentCount: number;
  highlightedCommentIds: Set<string>;
}

interface ReplyTarget {
    author: string;
    id: string;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  comments,
  currentUserProfile,
  onAddComment,
  isAddingComment,
  maxComments,
  currentCommentCount,
  highlightedCommentIds,
}) => {
  const [commentText, setCommentText] = useState('');
  
  // Initialize author based on user profile
  const initialAuthor = resolveUserNickname(currentUserProfile);

  const [commentAuthor, setCommentAuthor] = useState(initialAuthor);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  
  const [textError, setTextError] = useState('');
  const [authorError, setAuthorError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
      // Update author if profile changes (though usually static for session)
      const newAuthor = resolveUserNickname(currentUserProfile);
      if (newAuthor) {
        setCommentAuthor(newAuthor);
      }
  }, [currentUserProfile]);

  // When replyTarget changes, focus the textarea
  useEffect(() => {
    if (replyTarget && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [replyTarget]);

  const handleSetReplyTo = (author: string, id: string) => {
    setReplyTarget({ author, id });
  };

  const cancelReply = () => {
      setReplyTarget(null);
  };

  const validateComment = (): boolean => {
    let isValid = true;
    setTextError('');
    setAuthorError('');

    if (!commentText.trim()) {
      setTextError('내용을 입력해주세요.');
      isValid = false;
    }
    if (!commentAuthor.trim()) {
      setAuthorError('닉네임 입력');
      isValid = false;
    } else if (commentAuthor.length > MAX_COMMENT_AUTHOR_LENGTH + 8) { // +8 for IP buffer
      setAuthorError(`닉네임이 너무 깁니다.`);
      isValid = false;
    }
    return isValid;
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateComment() || isAddingComment) return;

    // If replying, prepend the mention.
    const finalCommentText = replyTarget 
        ? `@${replyTarget.author} ${commentText}` 
        : commentText;

    await onAddComment(postId, finalCommentText, commentAuthor);
    
    setCommentText('');
    setReplyTarget(null);
    setTextError('');
    setAuthorError('');
  };

  const remainingComments = maxComments - currentCommentCount;
  const isProfileSet = !!currentUserProfile;

  return (
    <section aria-labelledby="comment-section-title" className="bg-slate-50 rounded-2xl p-4 md:p-6 border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h4 id="comment-section-title" className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <i className="far fa-comments text-slate-400"></i>
          댓글 <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full text-sm shadow-sm border border-blue-100">{currentCommentCount}</span>
        </h4>
        {currentCommentCount >= maxComments && <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-full border border-red-100">최대 댓글 수 도달</span>}
      </div>

      {comments.length > 0 ? (
        <ul className="space-y-3 mb-8">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onSetReplyTo={handleSetReplyTo}
              isHighlighted={highlightedCommentIds.has(comment.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl mb-8 bg-slate-50/50">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300 shadow-sm">
                <i className="far fa-comment-dots text-xl"></i>
            </div>
            <p className="text-slate-500 font-medium">아직 댓글이 없습니다.</p>
            <p className="text-slate-400 text-sm mt-1">첫 번째 댓글을 남겨보세요!</p>
        </div>
      )}

      {currentCommentCount < maxComments && (
        <form onSubmit={handleSubmitComment} className="bg-white p-1 rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200 relative focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all duration-300">
          
          {/* Reply Banner */}
          {replyTarget && (
              <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-t-lg text-xs font-semibold flex items-center justify-between border-b border-indigo-100 animate-fade-in">
                  <span className="flex items-center gap-2">
                      <i className="fas fa-reply transform scale-x-[-1]"></i>
                      Replying to <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100 text-indigo-600">@{replyTarget.author}</span>
                  </span>
                  <button 
                    type="button" 
                    onClick={cancelReply} 
                    className="w-5 h-5 flex items-center justify-center hover:bg-indigo-100 rounded-full transition-colors"
                    aria-label="답글 취소"
                  >
                      <i className="fas fa-times"></i>
                  </button>
              </div>
          )}

          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
                 <div className="relative w-full sm:w-1/2 max-w-[180px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {currentUserProfile?.nicknameType === 'ANONYMOUS' ? (
                             <i className="fas fa-user-secret text-slate-400 text-xs"></i>
                        ) : (
                             <i className="fas fa-user text-indigo-500 text-xs"></i>
                        )}
                    </div>
                    <input
                        type="text"
                        value={commentAuthor}
                        onChange={(e) => {setCommentAuthor(e.target.value); if(authorError) validateComment();}}
                        readOnly={isProfileSet}
                        placeholder="닉네임"
                        className={`w-full pl-8 pr-3 py-1.5 bg-slate-50 border ${authorError ? 'border-red-300 bg-red-50' : 'border-slate-200'} rounded-lg text-sm focus:outline-none ${isProfileSet ? 'cursor-not-allowed text-slate-500 select-none bg-slate-100' : 'focus:bg-white focus:border-blue-400'} transition-all shadow-sm`}
                        title={isProfileSet ? "갤러리 생성 시 설정된 프로필입니다." : "닉네임 입력"}
                    />
                 </div>
                 {isProfileSet && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                        <i className="fas fa-lock mr-1"></i>프로필 고정됨
                    </span>
                 )}
            </div>
            
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={(e) => {setCommentText(e.target.value); if(textError) validateComment();}}
              rows={2}
              className={`w-full p-2 bg-transparent border-none focus:ring-0 resize-none text-slate-700 placeholder-slate-400 text-sm sm:text-base leading-relaxed`}
              placeholder={replyTarget ? "답글 내용을 입력하세요..." : "댓글을 남겨보세요... (존중하는 마음으로)"}
            />
          </div>
          
          <div className="flex justify-between items-center px-3 pb-3 pt-1 border-t border-slate-50">
             <div className="flex gap-2 text-xs">
                {textError && <span className="text-red-500 font-medium animate-pulse"><i className="fas fa-exclamation-circle mr-1"></i>{textError}</span>}
                {authorError && <span className="text-red-500 font-medium animate-pulse"><i className="fas fa-exclamation-circle mr-1"></i>{authorError}</span>}
                {!textError && !authorError && (
                    <span className="text-slate-400 flex items-center gap-1">
                        <i className="fas fa-pencil-alt text-[10px]"></i>
                        {remainingComments > 0 ? `${remainingComments}개 작성 가능` : `작성 불가`}
                    </span>
                )}
             </div>
             <button
              type="submit"
              disabled={isAddingComment || currentCommentCount >= maxComments}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95 hover:-translate-y-0.5"
            >
              {isAddingComment ? <LoadingSpinner small={true} /> : <><i className="fas fa-paper-plane text-xs"></i> 등록</>}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
