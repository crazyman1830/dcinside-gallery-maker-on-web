import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

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

const STEPS = [
  { phase: 'connecting', label: 'AI 연결' },
  { phase: 'gallery', label: '게시글 작성' },
  { phase: 'posts', label: '반응·댓글 구성' },
  { phase: 'complete', label: '완료' },
] as const;

const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const StreamingStatus: React.FC<StreamingStatusProps> = ({
  phase,
  message,
  reportedProgress,
  onCancel,
}) => {
  const baseProgress = PHASE_PROGRESS[phase] ?? 12;
  const [progress, setProgress] = useState(baseProgress);
  const [logs, setLogs] = useState<{ id: number; text: string }[]>(() => [
    { id: 0, text: message },
  ]);
  const nextLogId = useRef(1);
  const [startedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setProgress(previous => Math.max(previous, baseProgress));
  }, [baseProgress]);

  useEffect(() => {
    if (typeof reportedProgress !== 'number') return;
    setProgress(previous => Math.max(previous, Math.min(100, Math.max(0, reportedProgress))));
  }, [reportedProgress]);

  useEffect(() => {
    setLogs(previous =>
      previous.at(-1)?.text === message
        ? previous
        : [...previous, { id: nextLogId.current++, text: message }].slice(-5),
    );
  }, [message]);

  useEffect(() => {
    const timer = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [startedAt]);

  const roundedProgress = Math.round(progress);
  const activeStep = Math.max(
    0,
    STEPS.findIndex(step => step.phase === phase),
  );
  const statusLabel = phase === 'complete' ? '완료' : `${STEPS[activeStep].label} 중`;

  return (
    <section
      id="generation-status"
      className="mx-auto my-8 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl shadow-slate-200/60"
      aria-labelledby="generation-status-title"
      aria-busy={phase !== 'complete'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 id="generation-status-title" className="text-base font-bold text-slate-900">
            {statusLabel}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            완료되기 전까지 기존 갤러리는 안전하게 보존됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Icon icon="fas fa-stop" className="mr-2" />
          생성 취소
        </button>
      </div>

      <ol className="grid grid-cols-4 gap-2 px-5" aria-label="생성 단계">
        {STEPS.map((step, index) => {
          const state = index < activeStep ? 'done' : index === activeStep ? 'active' : 'todo';
          return (
            <li
              key={step.phase}
              className="flex flex-col gap-1.5"
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span
                className={`h-1.5 rounded-full ${
                  state === 'done'
                    ? 'bg-blue-600'
                    : state === 'active'
                      ? 'animate-pulse bg-blue-400'
                      : 'bg-slate-200'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[11px] font-medium sm:text-xs ${
                  state === 'todo' ? 'text-slate-400' : 'text-slate-700'
                }`}
              >
                {step.label}
                <span className="sr-only">
                  {state === 'done' ? ' 완료' : state === 'active' ? ' 진행 중' : ' 대기'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-3 px-5 pt-4">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="갤러리 생성 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={roundedProgress}
          aria-valuetext={`${statusLabel}, 약 ${roundedProgress}%`}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${roundedProgress}%` }}
          />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-700">
          {roundedProgress}%
        </span>
        <span className="flex items-center gap-1 text-xs tabular-nums text-slate-500">
          <Icon icon="fas fa-clock" />
          <span className="sr-only">경과 시간</span>
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      <ul
        className="m-5 min-h-28 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
        aria-label="생성 진행 기록"
        aria-live="polite"
        aria-relevant="additions"
      >
        {logs.map((log, index) => (
          <li
            key={log.id}
            className={`flex items-start gap-2 ${index === logs.length - 1 ? 'text-slate-800' : 'text-slate-500'}`}
          >
            <span className="mt-0.5 shrink-0 text-blue-500" aria-hidden="true">
              ›
            </span>
            <span className="break-words leading-relaxed">{log.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
