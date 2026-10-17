import React from 'react';
import { Post, ReplyTarget, UserProfile } from '../types';
import { CommentSection } from './CommentSection';
import { useVoting } from '../hooks/useVoting';
import { formatTimestamp } from '../utils/common';
import { Icon } from './Icon';

interface PostViewProps {
  post: Post;
  currentUserProfile: UserProfile | null;
  onBackToList?: () => void;
  onWritePost?: () => void;
  onAddComment: (
    postId: string,
    commentText: string,
    commentAuthor: string,
    replyTo?: ReplyTarget,
  ) => Promise<void>;
  isAddingComment: boolean;
  maxComments: number;
  highlightedCommentIds: Set<string>;
  onVotePost?: (
    postId: string,
    voteType: 'rec' | 'nonrec' | null,
    recs: number,
    nonRecs: number,
  ) => void;
  onVoteComment?: (
    postId: string,
    commentId: string,
    voteType: 'rec' | 'nonrec' | null,
    recs: number,
    nonRecs: number,
  ) => void;
}

const PostContentRenderer: React.FC<{ content: string }> = ({ content }) => {
  // Regex to match (Type: description) patterns.
  // Types: 사진 (Photo), 동영상 (Video), 콘 (Emoticon)
  const mediaRegex = /\((사진|동영상|콘):\s*([^)]+)\)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mediaRegex.exec(content)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      const textPart = content.substring(lastIndex, match.index);
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-line">
          {textPart}
        </span>,
      );
    }

    const type = match[1]; // 사진, 동영상, or 콘
    const description = match[2].trim();

    if (type === '동영상') {
      parts.push(
        <figure
          key={`media-${match.index}`}
          className="mx-auto my-8 max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-6 text-white shadow-lg"
        >
          <div className="mb-4 flex items-center gap-3 text-slate-300" aria-hidden="true">
            <Icon icon="fas fa-film" className="text-3xl" />
            <span className="text-xs font-bold uppercase tracking-widest">AI 미디어 묘사</span>
          </div>
          <figcaption className="break-words whitespace-pre-wrap text-sm leading-relaxed text-white/90">
            <span className="mb-1 block text-xs font-bold text-blue-300">동영상 장면 설명</span>
            {description}
            <span className="mt-3 block text-xs text-slate-300">
              실제 재생 가능한 영상이 아닌, 게시물 속 장면을 설명한 텍스트입니다.
            </span>
          </figcaption>
        </figure>,
      );
    } else if (type === '콘') {
      parts.push(
        <span
          key={`media-${match.index}`}
          className="m-2 inline-flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-2 align-middle shadow-sm sm:h-32 sm:w-32"
          aria-label={`디시콘 묘사: ${description}`}
        >
          <span className="flex flex-1 items-center justify-center">
            <Icon
              icon="far fa-grin-squint"
              className="-rotate-6 text-4xl text-yellow-400 sm:text-5xl"
            />
          </span>
          <span className="mt-1 line-clamp-2 w-full break-words px-1 text-center text-[10px] font-medium leading-tight text-slate-500">
            {description}
          </span>
        </span>,
      );
    } else {
      // Photo
      parts.push(
        <figure
          key={`media-${match.index}`}
          className="mx-auto my-8 flex min-h-56 w-full max-w-lg flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500 shadow-inner"
        >
          <Icon icon="fas fa-image" className="mb-3 text-5xl text-slate-300" />
          <figcaption className="max-w-[90%] break-words rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium leading-snug text-slate-700 shadow-sm whitespace-pre-wrap">
            <span className="mb-1 block text-xs font-bold text-blue-600">사진 장면 설명</span>
            {description}
          </figcaption>
        </figure>,
      );
    }

    lastIndex = mediaRegex.lastIndex;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-line">
        {content.substring(lastIndex)}
      </span>,
    );
  }

  return (
    <div className="min-h-[150px] break-words text-base leading-relaxed text-slate-800 md:text-lg">
      {parts}
    </div>
  );
};

export const PostView: React.FC<PostViewProps> = ({
  post,
  currentUserProfile,
  onBackToList,
  onWritePost,
  onAddComment,
  isAddingComment,
  maxComments,
  highlightedCommentIds,
  onVotePost,
  onVoteComment,
}) => {
  const { recs, nonRecs, voted, handleRecommend, handleNonRecommend } = useVoting(
    post.recommendations,
    post.nonRecommendations,
    post.voted,
    (nextVoted, nextRecs, nextNonRecs) => {
      if (onVotePost) {
        onVotePost(post.id, nextVoted, nextRecs, nextNonRecs);
      }
    },
  );

  return (
    <div className="animate-fade-in-up">
      <article className="bg-white p-1 md:p-2 rounded-xl">
        {/* Header Section */}
        <header className="mb-8 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-3 mb-4">
            {post.isBestPost && (
              <div className="mt-1.5 flex-shrink-0">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 shadow-sm ring-1 ring-amber-200"
                  title="개념글"
                >
                  <Icon icon="fas fa-crown" className="text-sm" />
                  <span className="sr-only">개념글</span>
                </span>
              </div>
            )}
            <h3
              id="post-title"
              tabIndex={-1}
              className="text-2xl md:text-3xl font-bold text-slate-800 leading-tight break-words tracking-tight outline-none"
            >
              {post.title}
            </h3>
          </div>

          <div className="flex flex-wrap items-center justify-between text-sm text-slate-500 bg-slate-50 px-4 py-3 rounded-lg border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400"
                  aria-hidden="true"
                >
                  <Icon icon="fas fa-user" className="text-xs" />
                </div>
                <span className="font-semibold text-slate-700">{post.author}</span>
              </div>
              <div className="h-3 w-[1px] bg-slate-300"></div>
              <time className="font-mono text-xs text-slate-600" dateTime={post.timestamp}>
                {formatTimestamp(post.timestamp)}
              </time>
            </div>
            <div className="flex items-center gap-3 mt-3 sm:mt-0 w-full sm:w-auto justify-end">
              <span
                title="조회수"
                className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-xs"
              >
                <Icon icon="far fa-eye" className="text-slate-400" /> {post.views.toLocaleString()}
              </span>
              <span
                title="추천수"
                className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-xs text-red-600 font-medium"
              >
                <Icon icon="far fa-thumbs-up" /> {recs}
              </span>
              <span
                title="댓글수"
                className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-xs text-blue-500 font-medium"
              >
                <Icon icon="far fa-comment-dots" /> {post.comments.length}
              </span>
            </div>
          </div>
        </header>

        {/* Content Section */}
        <div className="mb-16 px-1">
          <PostContentRenderer content={post.content} />
        </div>

        {/* Action Buttons */}
        <div className="mb-12 flex flex-col items-center gap-4 select-none">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={handleRecommend}
              className={`group relative flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
                    ${
                      voted === 'rec'
                        ? 'bg-red-50 border-red-500 text-red-600 shadow-inner scale-95'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:bg-red-50/30 hover:text-red-600 shadow-sm hover:shadow-md hover:-translate-y-1'
                    }`}
              aria-label={`추천 ${recs.toLocaleString()}개`}
              aria-pressed={voted === 'rec'}
            >
              <Icon
                icon="fas fa-thumbs-up"
                className="text-2xl sm:text-3xl mb-1 sm:mb-2 transform group-hover:scale-110 transition-transform duration-300"
              />
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight">{recs}</span>
              <span
                className={`absolute -bottom-8 text-sm font-medium transition-all duration-300 ${voted === 'rec' ? 'text-red-600 opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2'}`}
              >
                개념글
              </span>
            </button>

            <button
              type="button"
              onClick={handleNonRecommend}
              className={`group relative flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                    ${
                      voted === 'nonrec'
                        ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-inner scale-95'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50/30 hover:text-blue-600 shadow-sm hover:shadow-md hover:-translate-y-1'
                    }`}
              aria-label={`비추천 ${nonRecs.toLocaleString()}개`}
              aria-pressed={voted === 'nonrec'}
            >
              <Icon
                icon="fas fa-thumbs-down"
                className="text-2xl sm:text-3xl mb-1 sm:mb-2 transform group-hover:scale-110 transition-transform duration-300"
              />
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight">
                {nonRecs}
              </span>
              <span
                className={`absolute -bottom-8 text-sm font-medium transition-all duration-300 ${voted === 'nonrec' ? 'text-blue-600 opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2'}`}
              >
                비추
              </span>
            </button>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between border-t border-slate-100 pt-8">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="px-4 sm:px-5 py-2.5 rounded-lg font-medium bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 transition-all duration-200 flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Icon icon="fas fa-list" className="text-slate-400" /> 목록으로
            </button>
          )}
          {onWritePost && (
            <button
              type="button"
              onClick={onWritePost}
              className="px-4 sm:px-5 py-2.5 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Icon icon="fas fa-pen" /> 글쓰기
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
          onVoteComment={
            onVoteComment
              ? (commentId, voteType, recsVal, nonRecsVal) =>
                  onVoteComment(post.id, commentId, voteType, recsVal, nonRecsVal)
              : undefined
          }
        />
      </div>
    </div>
  );
};
