
import React from 'react';
import { Comment } from '../types';
import { useVoting } from '../hooks/useVoting';
import { POST_AUTHOR_PREFIX } from '../constants';

interface CommentItemProps {
  comment: Comment;
  onSetReplyTo: (author: string, id: string) => void;
  isHighlighted: boolean;
}

const CommentContentRenderer: React.FC<{ text: string }> = ({ text }) => {
    // 1. Identify Mention at start
    let mentionPart = null;
    let contentBody = text;

    const mentionRegex = /^(@[\w\s.-]+)(.*)/s;
    const mentionMatch = text.match(mentionRegex);
    if (mentionMatch) {
        mentionPart = <span className="font-semibold text-indigo-600 mr-1 select-none bg-indigo-50 px-1 rounded">{mentionMatch[1]}</span>;
        contentBody = mentionMatch[2];
    }

    // 2. Parse DC-Cones in the remaining body
    const conRegex = /\(콘:\s*([^\)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = conRegex.exec(contentBody)) !== null) {
         if (match.index > lastIndex) {
            parts.push(<span key={`text-${lastIndex}`}>{contentBody.substring(lastIndex, match.index)}</span>);
        }
        const description = match[1].trim();
        parts.push(
            <span key={`con-${match.index}`} className="inline-block mx-1 px-2 py-0.5 bg-yellow-50 border border-yellow-200 rounded text-xs text-gray-500 italic align-middle select-none" title="디시콘">
                <i className="far fa-smile mr-1"></i>{description}
            </span>
        );
        lastIndex = conRegex.lastIndex;
    }
    if (lastIndex < contentBody.length) {
        parts.push(<span key={`text-${lastIndex}`}>{contentBody.substring(lastIndex)}</span>);
    }

    return (
        <>
            {mentionPart}
            {parts}
        </>
    );
};

export const CommentItem: React.FC<CommentItemProps> = ({ comment, onSetReplyTo, isHighlighted }) => {
  const { recs, nonRecs, voted, handleRecommend, handleNonRecommend } = useVoting(comment.recommendations, comment.nonRecommendations);

  const itemClasses = `p-4 rounded-lg shadow border transition-all duration-300 ease-in-out
    ${isHighlighted ? 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-200' : 'bg-white border-gray-200 hover:shadow-md'}`;

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
      aria-label={`${authorDisplay}의 댓글${isPostAuthorComment ? ' (글쓴이)' : ''}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-bold text-sm ${isPostAuthorComment ? 'text-blue-600' : 'text-slate-700'}`}>
            {isPostAuthorComment && <i className="fas fa-user-edit mr-1 text-xs"></i>}
            {authorDisplay}
          </span>
          <span className="text-[10px] text-slate-300">|</span>
          <span className="text-xs text-slate-400 font-mono">{comment.timestamp}</span>
        </div>
        
        <div className="flex items-center gap-1">
            <div className="flex bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
                <button
                    onClick={(e) => { e.stopPropagation(); handleRecommend(); }}
                    className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors
                    ${voted === 'rec' ? 'bg-red-50 text-red-600 font-bold' : 'text-slate-400 hover:text-red-500 hover:bg-white'}`}
                    title="추천"
                >
                    <i className="fas fa-thumbs-up"></i> {recs > 0 && recs}
                </button>
                <div className="w-[1px] bg-slate-200"></div>
                <button
                    onClick={(e) => { e.stopPropagation(); handleNonRecommend(); }}
                    className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors
                    ${voted === 'nonrec' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-400 hover:text-blue-500 hover:bg-white'}`}
                    title="비추천"
                >
                    <i className="fas fa-thumbs-down"></i> {nonRecs > 0 && nonRecs}
                </button>
            </div>
            
            <button
                onClick={handleReplyClick}
                className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                title="답글 달기"
                aria-label="이 댓글에 답글 달기"
            >
                <i className="fas fa-reply text-xs transform scale-x-[-1]"></i>
            </button>
        </div>
      </div>
      <div className="text-slate-800 text-sm leading-relaxed break-all whitespace-pre-line pl-0.5">
        <CommentContentRenderer text={comment.text} />
      </div>
    </li>
  );
};
