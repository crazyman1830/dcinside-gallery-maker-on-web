import React from 'react';
import type { GenerationWarning, Post } from '../types';
import { Icon } from './Icon';

interface StageWarningsProps {
  warnings: GenerationWarning[];
  posts: Post[];
  listLabel: string;
  retryDisabled: boolean;
  onRetry: () => void;
  onSelectPost?: (postId: string) => void;
}

const STAGE_LABELS: Partial<Record<NonNullable<GenerationWarning['stage']>, string>> = {
  evaluation: '반응 수치 평가 실패',
  comments: '댓글 생성 실패',
};

export const StageWarnings: React.FC<StageWarningsProps> = ({
  warnings,
  posts,
  listLabel,
  retryDisabled,
  onRetry,
  onSelectPost,
}) => {
  if (!warnings.length) return null;
  const canRetry = warnings.some(
    warning => warning.postId && (warning.stage === 'evaluation' || warning.stage === 'comments'),
  );

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-semibold">
          <Icon icon="fas fa-exclamation-circle" className="mr-2 text-amber-600" />
          생성 단계 기록 <span className="font-normal text-slate-600">({warnings.length}건)</span>
        </p>
        {canRetry && (
          <button
            type="button"
            disabled={retryDisabled}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
            onClick={onRetry}
          >
            실패 지점에서 재시도
          </button>
        )}
      </div>
      <ul aria-label={listLabel} className="mt-2 space-y-1.5">
        {warnings.map((warning, index) => {
          const title = warning.postId
            ? (posts.find(post => post.id === warning.postId)?.title ?? '게시물')
            : null;
          return (
            <li key={`${warning.code}-${warning.postId}-${index}`} className="leading-relaxed">
              <span className="mr-2 font-semibold">
                {(warning.stage && STAGE_LABELS[warning.stage]) ?? '생성 안내'}
              </span>
              {warning.postId && title && onSelectPost && (
                <button
                  type="button"
                  className="mr-2 rounded text-left underline underline-offset-2 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  onClick={() => onSelectPost(warning.postId!)}
                >
                  {title}
                </button>
              )}
              <span className="text-slate-700">{warning.message}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
