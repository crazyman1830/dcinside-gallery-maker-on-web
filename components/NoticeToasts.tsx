import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type NoticeTone = 'success' | 'warning' | 'error';

export interface Notice {
  id: string;
  tone: NoticeTone;
  message: string;
  onDismiss: () => void;
}

const TONE_STYLES: Record<
  NoticeTone,
  { container: string; icon: IconName; iconColor: string; label: string }
> = {
  success: {
    container: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    icon: 'fas fa-check-circle',
    iconColor: 'text-emerald-600',
    label: '완료',
  },
  warning: {
    container: 'border-amber-300 bg-amber-50 text-amber-900',
    icon: 'fas fa-exclamation-circle',
    iconColor: 'text-amber-600',
    label: '안내',
  },
  error: {
    container: 'border-red-300 bg-red-50 text-red-900',
    icon: 'fas fa-exclamation-triangle',
    iconColor: 'text-red-600',
    label: '오류',
  },
};

// Errors stay until dismissed; informational notices step aside on their own
// unless the pointer or keyboard focus is resting on them.
const AUTO_DISMISS_MS: Partial<Record<NoticeTone, number>> = {
  success: 4_000,
  warning: 10_000,
};

const Toast: React.FC<Notice> = ({ tone, message, onDismiss }) => {
  const [isPaused, setIsPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  const delay = AUTO_DISMISS_MS[tone];

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!delay || isPaused) return;
    const timer = setTimeout(() => dismissRef.current(), delay);
    return () => clearTimeout(timer);
  }, [delay, isPaused, message]);

  const style = TONE_STYLES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3 text-sm shadow-lg animate-fade-in ${style.container}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <Icon icon={style.icon} className={`${style.iconColor} mt-0.5 shrink-0`} />
      <p className="min-w-0 flex-1 break-words leading-relaxed">
        <span className="sr-only">{style.label}: </span>
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        aria-label="알림 닫기"
      >
        <Icon icon="fas fa-times" />
      </button>
    </div>
  );
};

export const NoticeToasts: React.FC<{ notices: Notice[] }> = ({ notices }) => (
  <div
    className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex max-w-md flex-col gap-2 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96 sm:px-0"
    aria-live="polite"
  >
    {notices.map(notice => (
      <Toast key={notice.id} {...notice} />
    ))}
  </div>
);
