import { useEffect, useState } from 'react';

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
  onContinue: (event: string) => void;
}) => {
  const [draft, setDraft] = useState(notes);
  const [nextEvent, setNextEvent] = useState('');
  useEffect(() => setDraft(notes), [notes]);
  return (
    <details className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-slate-800">
        세계관 기억과 이어서 생성
      </summary>
      <p className="my-3 text-sm text-slate-600">
        반복 등장하는 인물, 용어, 주요 사건을 기록하세요. 저장한 메모와 최근 게시물 발췌를 다음
        생성에 참고합니다.
      </p>
      <label className="block text-sm text-slate-700">
        세계관 메모
        <textarea
          value={draft}
          maxLength={2000}
          disabled={disabled}
          onChange={event => setDraft(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 p-3"
          rows={3}
        />
      </label>
      <label className="mt-4 block text-sm text-slate-700">
        다음 사건 / 새 떡밥 (선택)
        <textarea
          value={nextEvent}
          maxLength={500}
          disabled={disabled}
          rows={2}
          placeholder="예: 비무대회 결승 직후 승부조작 의혹이 터졌다."
          onChange={event => setNextEvent(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 p-3"
        />
      </label>
      <p className="mt-2 text-xs text-slate-600">
        {currentEvent ? `현재 떡밥: ${currentEvent}. ` : ''}비워두면 현재 사건을 이어갑니다. 기존
        글·댓글·추천과 세계선은 유지됩니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          disabled={disabled}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
          onClick={() => onSave(draft)}
        >
          메모 저장
        </button>
        <button
          disabled={disabled || draft !== notes}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => onContinue(nextEvent.trim())}
        >
          이 세계관에서 새 글 5개 추가
        </button>
      </div>
      {draft !== notes && (
        <p className="mt-2 text-sm text-slate-600">변경한 메모를 먼저 저장해주세요.</p>
      )}
    </details>
  );
};
