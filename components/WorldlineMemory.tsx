import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export const WorldlineMemory = ({
  notes,
  currentEvent,
  disabled,
  onSave,
  onContinue,
}: {
  notes: string;
  currentEvent?: string;
  disabled: boolean;
  onSave: (notes: string) => void;
  onContinue: (event: string, notes: string) => void;
}) => {
  const [draft, setDraft] = useState(notes);
  const [nextEvent, setNextEvent] = useState('');
  useEffect(() => setDraft(notes), [notes]);
  const isDirty = draft.trim() !== notes.trim();
  const fieldClass =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100';

  return (
    <details className="group mb-4 rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
        <span>세계관 기억과 이어서 생성</span>
        <Icon
          icon="fas fa-chevron-down"
          className="text-xs text-slate-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        <p className="mb-3 text-sm text-slate-600">
          반복 등장하는 인물, 용어, 주요 사건을 기록하세요. 저장한 메모와 최근 게시물 발췌를 다음
          생성에 참고합니다.
        </p>
        <label className="block text-sm font-medium text-slate-700">
          세계관 메모
          <textarea
            value={draft}
            maxLength={2000}
            disabled={disabled}
            onChange={event => setDraft(event.target.value)}
            className={fieldClass}
            rows={3}
          />
        </label>
        <p className="mt-1 text-right text-xs text-slate-500">{draft.length}/2000</p>
        <label className="mt-2 block text-sm font-medium text-slate-700">
          다음 사건 / 새 떡밥 (선택)
          <textarea
            value={nextEvent}
            maxLength={500}
            disabled={disabled}
            rows={2}
            placeholder="예: 비무대회 결승 직후 승부조작 의혹이 터졌다."
            onChange={event => setNextEvent(event.target.value)}
            className={fieldClass}
          />
        </label>
        <p className="mt-2 text-xs text-slate-600">
          {currentEvent ? `현재 떡밥: ${currentEvent}. ` : ''}비워두면 현재 사건을 이어갑니다. 기존
          글·댓글·추천과 세계선은 유지됩니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={disabled || !isDirty}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            onClick={() => onSave(draft)}
          >
            메모 저장
          </button>
          <button
            type="button"
            disabled={disabled}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
            onClick={() => {
              const savedNotes = draft.trim();
              // Saving first keeps the stored memo in step with the request even
              // if the continuation fails.
              if (isDirty) onSave(savedNotes);
              onContinue(nextEvent.trim(), savedNotes);
            }}
          >
            이 세계관에서 새 글 5개 추가
          </button>
          {isDirty && (
            <span className="text-xs text-slate-600">
              변경한 메모는 새 글을 추가할 때 함께 저장됩니다.
            </span>
          )}
        </div>
      </div>
    </details>
  );
};
