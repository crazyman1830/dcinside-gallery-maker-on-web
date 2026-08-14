import React, { useEffect, useMemo, useState } from 'react';

interface StreamingStatusProps {
  phase: string;
  message: string;
  reportedProgress?: number | null;
  onCancel: () => void;
}

const PHASE_PROGRESS: Record<string, number> = {
  connecting: 8,
  gallery: 28,
  posts: 68,
  complete: 100,
};

export const StreamingStatus: React.FC<StreamingStatusProps> = ({
  phase,
  message,
  reportedProgress,
  onCancel,
}) => {
  const baseProgress = PHASE_PROGRESS[phase] ?? 12;
  const [progress, setProgress] = useState(baseProgress);
  const [logs, setLogs] = useState<string[]>([message]);

  useEffect(() => {
    setProgress(previous => Math.max(previous, baseProgress));
  }, [baseProgress]);

  useEffect(() => {
    if (typeof reportedProgress !== 'number') return;
    setProgress(previous => Math.max(previous, Math.min(100, Math.max(0, reportedProgress))));
  }, [reportedProgress]);

  useEffect(() => {
    setLogs(previous =>
      previous.at(-1) === message ? previous : [...previous, message].slice(-5),
    );
  }, [message]);

  const roundedProgress = Math.round(progress);
  const statusLabel = useMemo(() => {
    if (phase === 'complete') return '완료';
    if (phase === 'posts') return '게시물 반응 구성 중';
    if (phase === 'gallery') return '갤러리 생성 중';
    return 'AI 연결 중';
  }, [phase]);

  return (
    <section
      id="generation-status"
      className="mx-auto my-8 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-left font-mono shadow-2xl ring-1 ring-slate-900/5"
      aria-labelledby="generation-status-title"
      aria-busy={phase !== 'complete'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/50 bg-slate-800 px-5 py-3">
        <div>
          <h2 id="generation-status-title" className="text-sm font-bold text-white">
            {statusLabel}
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            완료되기 전까지 기존 갤러리는 안전하게 보존됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <i className="fas fa-stop mr-2" aria-hidden="true" />
          생성 취소
        </button>
      </div>

      <div
        className="h-2 w-full bg-slate-800"
        role="progressbar"
        aria-label="갤러리 생성 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedProgress}
        aria-valuetext={`${statusLabel}, 약 ${roundedProgress}%`}
      >
        <div
          className="h-full bg-blue-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${roundedProgress}%` }}
        />
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[120px_1fr] sm:p-6">
        <div className="flex flex-col items-center justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-slate-700">
            <span className="text-2xl font-bold text-white">
              {roundedProgress}
              <span className="text-sm text-slate-500">%</span>
            </span>
          </div>
        </div>
        <div
          className="min-h-40 rounded-xl border border-slate-700/50 bg-black/30 p-4 text-xs sm:text-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          {logs.map((log, index) => (
            <div key={`${index}-${log}`} className="mb-3 flex items-start last:mb-0">
              <span className="mr-3 shrink-0 text-emerald-500" aria-hidden="true">
                ➜
              </span>
              <span className="break-words leading-relaxed text-slate-300">{log}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
