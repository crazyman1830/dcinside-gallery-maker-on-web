import React from 'react';
import { Icon } from './Icon';

interface GenerationFailureCardProps {
  stage: string;
  message: string;
  failedAt: string;
  isAppend: boolean;
  disabled: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

export const GenerationFailureCard: React.FC<GenerationFailureCardProps> = ({
  stage,
  message,
  failedAt,
  isAppend,
  disabled,
  onRetry,
  onDismiss,
}) => (
  <section
    className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
    aria-labelledby="generation-failure-title"
  >
    <h3 id="generation-failure-title" className="font-semibold text-slate-900">
      <Icon icon="fas fa-exclamation-circle" className="mr-2 text-amber-600" />
      {isAppend ? '이어서 생성하지 못했습니다' : '갤러리를 생성하지 못했습니다'}
    </h3>
    <p className="mt-1 text-sm text-slate-800">
      실패 단계: {stage} · {new Date(failedAt).toLocaleTimeString('ko-KR')}
    </p>
    <p className="mt-1 break-words text-sm text-slate-700">{message}</p>
    <p className="mt-1 text-xs text-slate-600">기존 갤러리는 그대로 보존되어 있습니다.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50"
        onClick={onRetry}
      >
        실패 지점에서 재시도
      </button>
      <button
        type="button"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onDismiss}
      >
        닫기
      </button>
    </div>
  </section>
);
