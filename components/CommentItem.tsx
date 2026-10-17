import React from 'react';
import { Comment } from '../types';
import { useVoting } from '../hooks/useVoting';
import { POST_AUTHOR_PREFIX } from '../constants';
import { formatTimestamp } from '../utils/common';
import { Icon } from './Icon';

interface CommentItemProps {
  comment: Comment;
  onSetReplyTo: (author: string, id: string) => void;
  isHighlighted: boolean;
  isReply?: boolean;
  onVoteComment?: (
    commentId: string,
    voteType: 'rec' | 'nonrec' | null,
    recs: number,
    nonRecs: number,
  ) => void;
}

const CommentContentRenderer: React.FC<{ comment: Comment }> = ({ comment }) => {
  let mention = comment.replyTo ? `@${comment.replyTo.author}` : null;
  let contentBody = comment.text;

  if (mention && contentBody.startsWith(`${mention} `)) {
    contentBody = contentBody.slice(mention.length + 1);
  } else if (!mention) {
    // Legacy replies stored only a leading one-token mention. Deliberately
    // keep this conservative so ordinary sentences are never swallowed.
    const legacyMatch = contentBody.match(/^(@[^\s]+)\s+([\s\S]+)$/);
    if (legacyMatch) {
      mention = legacyMatch[1];
      contentBody = legacyMatch[2];
    }
  }

  // 2. Parse DC-Cones in the remaining body
  const conRegex = /\(콘:\s*([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = conRegex.exec(contentBody)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>{contentBody.substring(lastIndex, match.index)}</span>,
      );
    }
    const description = match[1].trim();
    parts.push(
      <span
        key={`con-${match.index}`}
        className="mx-1 inline-block select-none rounded border border-yellow-200 bg-yellow-50 px-2 py-0.5 align-middle text-xs italic text-slate-600"
        title="디시콘"
      >
        <Icon icon="far fa-smile" className="mr-1" />
        {description}
      </span>,
    );
    lastIndex = conRegex.lastIndex;
  }
  if (lastIndex < contentBody.length) {
    parts.push(<span key={`text-${lastIndex}`}>{contentBody.substring(lastIndex)}</span>);
  }

  return (
    <>
      {mention && (
        <span className="font-semibold text-indigo-600 mr-1 select-none bg-indigo-50 px-1 rounded">
          {mention}
        </span>
      )}
      {parts}
    </>
  );
};

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  onSetReplyTo,
  isHighlighted,
  isReply = false,
  onVoteComment,
}) => {
  const { recs, nonRecs, voted, handleRecommend, handleNonRecommend } = useVoting(
    comment.recommendations,
    comment.nonRecommendations,
    comment.voted,
    (nextVoted, nextRecs, nextNonRecs) => {
      if (onVoteComment) {
        onVoteComment(comment.id, nextVoted, nextRecs, nextNonRecs);
      }
    },
  );

  const itemClasses = `relative rounded-lg border transition-all duration-300 ease-in-out ${
    isReply ? 'ml-6 p-3 sm:ml-10' : 'p-4 shadow-sm'
  } ${
    isHighlighted
      ? 'border-yellow-300 bg-yellow-50 ring-2 ring-yellow-200'
      : isReply
        ? 'border-slate-200 bg-slate-50'
        : 'border-slate-200 bg-white hover:shadow-md'
  }`;

  const handleReplyClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const baseAuthor = comment.author.startsWith(POST_AUTHOR_PREFIX)
      ? comment.author.substring(POST_AUTHOR_PREFIX.length)
      : comment.author;
    onSetReplyTo(baseAuthor, comment.id);
  };

  let authorDisplay = comment.author;
  let isPostAuthorComment = false;
  if (comment.author.startsWith(POST_AUTHOR_PREFIX)) {
    authorDisplay = comment.author.substring(POST_AUTHOR_PREFIX.length);
    isPostAuthorComment = true;
  }

  return (
    <li
      className={itemClasses}
      id={`comment-${comment.id}`}
      aria-label={`${authorDisplay}의 댓글${isPostAuthorComment ? ' (글쓴이)' : ''}${isReply ? ', 답글' : ''}`}
    >
      {isReply && (
        <span
          className="absolute -left-5 top-3 text-sm text-slate-400 sm:-left-7"
          aria-hidden="true"
        >
          ㄴ
        </span>
      )}
      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-bold text-sm ${isPostAuthorComment ? 'text-blue-600' : 'text-slate-700'}`}
          >
            {isPostAuthorComment && <Icon icon="fas fa-user-edit" className="mr-1 text-xs" />}
            {authorDisplay}
          </span>
          <span className="text-[10px] text-slate-300">|</span>
          <time className="font-mono text-xs text-slate-600" dateTime={comment.timestamp}>
            {formatTimestamp(comment.timestamp)}
          </time>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleRecommend();
              }}
              className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors
                    ${voted === 'rec' ? 'bg-red-50 text-red-600 font-bold' : 'text-slate-600 hover:text-red-600 hover:bg-white'}`}
              title="추천"
              aria-label={`댓글 추천 ${recs}개`}
              aria-pressed={voted === 'rec'}
            >
              <Icon icon="fas fa-thumbs-up" /> {recs > 0 && recs}
            </button>
            <div className="w-[1px] bg-slate-200"></div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleNonRecommend();
              }}
              className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors
                    ${voted === 'nonrec' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:text-blue-600 hover:bg-white'}`}
              title="비추천"
              aria-label={`댓글 비추천 ${nonRecs}개`}
              aria-pressed={voted === 'nonrec'}
            >
              <Icon icon="fas fa-thumbs-down" /> {nonRecs > 0 && nonRecs}
            </button>
          </div>

          <button
            type="button"
            onClick={handleReplyClick}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
            title="답글 달기"
            aria-label="이 댓글에 답글 달기"
          >
            <Icon icon="fas fa-reply" className="text-xs transform scale-x-[-1]" />
          </button>
        </div>
      </div>
      <div className="text-slate-800 text-sm leading-relaxed break-all whitespace-pre-line pl-0.5">
        <CommentContentRenderer comment={comment} />
      </div>
    </li>
  );
};
