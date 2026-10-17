import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { Icon } from './Icon';

interface WorldviewFeedbackProps {
  isFetching: boolean;
  feedback: string | null;
  onFetchFeedback: () => void;
  isVisible: boolean;
}

export const WorldviewFeedback: React.FC<WorldviewFeedbackProps> = ({
  isFetching,
  feedback,
  onFetchFeedback,
  isVisible,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!isVisible) {
    return null;
  }

  const copyFeedback = async () => {
    if (!feedback) return;
    try {
      await navigator.clipboard.writeText(feedback);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const buttonClass =
    'inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50';

  return (
    <section
      className="my-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      aria-labelledby="worldview-feedback-title"
    >
      <h3
        id="worldview-feedback-title"
        className="mb-4 flex items-center text-lg font-bold text-slate-800"
      >
        <Icon icon="fas fa-lightbulb" className="mr-2 text-yellow-500" />
        AI의 세계관 설정 개선 제안
      </h3>
      {isFetching ? (
        <div className="flex items-center justify-center py-4">
          <LoadingSpinner />
        </div>
      ) : feedback ? (
        <>
          <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 sm:text-base">
            {feedback}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyFeedback()}
              className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              제안 복사
            </button>
            <button
              type="button"
              onClick={() => {
                setCopyState('idle');
                onFetchFeedback();
              }}
              className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              다시 받기
            </button>
            {copyState !== 'idle' && (
              <span role="status" className="text-sm text-slate-600">
                {copyState === 'copied'
                  ? '제안을 복사했습니다. 세계관 직접 입력란에 붙여 넣어 다듬어 보세요.'
                  : '복사하지 못했습니다. 내용을 직접 선택해 복사해주세요.'}
              </span>
            )}
          </div>
        </>
      ) : (
        <div>
          <p className="mb-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            생성된 갤러리 내용을 바탕으로 AI가 사용자의 &apos;직접 입력&apos; 세계관 설정을 더
            풍부하고 일관성 있게 만들 수 있도록 피드백을 제공합니다.
          </p>
          <button
            type="button"
            onClick={onFetchFeedback}
            className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`}
          >
            <Icon icon="fas fa-comment-dots" className="mr-2" />
            피드백 받기
          </button>
        </div>
      )}
    </section>
  );
};
