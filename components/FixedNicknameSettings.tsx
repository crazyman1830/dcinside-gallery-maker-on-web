import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FixedNickname } from '../types';
import { fixedNicknamesSchema } from '../schemas';

interface Props {
  value: FixedNickname[];
  onSave: (entries: FixedNickname[]) => void;
  disabled?: boolean;
  reservedNickname?: string;
}

export const FixedNicknameSettings = ({ value, onSave, disabled, reservedNickname }: Props) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FixedNickname[]>([]);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal();
      title.current?.focus();
    } else if (!open && dialog.current?.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
  }, [open]);
  const update = (id: string, patch: Partial<FixedNickname>) => {
    setDraft(previous => previous.map(entry => (entry.id === id ? { ...entry, ...patch } : entry)));
    setError('');
  };
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        onClick={() => {
          setDraft(value.map(entry => ({ ...entry })));
          setError('');
          setOpen(true);
        }}
      >
        고정닉 설정 ({value.length}/8)
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          aria-labelledby="fixed-nickname-title"
          className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl backdrop:bg-slate-900/50"
          onCancel={event => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              event.stopPropagation();
              const parsed = fixedNicknamesSchema.safeParse(draft);
              if (!parsed.success) {
                setError(parsed.error.issues[0]?.message ?? '설정을 확인해주세요.');
                return;
              }
              if (
                reservedNickname &&
                parsed.data.some(
                  entry =>
                    entry.nickname.toLocaleLowerCase() ===
                    reservedNickname.trim().toLocaleLowerCase(),
                )
              ) {
                setError('내 닉네임과 AI 고정닉 이름은 달라야 합니다.');
                return;
              }
              onSave(parsed.data);
              setOpen(false);
            }}
          >
            <h2
              ref={title}
              tabIndex={-1}
              id="fixed-nickname-title"
              className="text-xl font-bold text-slate-900 outline-none"
            >
              갤러리 고정닉 설정
            </h2>
            <p className="my-3 text-sm leading-relaxed text-slate-600">
              AI가 연기할 갤러리 고정닉입니다. 글과 댓글에서 같은 닉네임과 성향을 유지하도록
              참고합니다. 기존 글은 유지되며 저장 후 생성부터 적용됩니다.
            </p>
            {error && (
              <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="space-y-4">
              {draft.map((entry, index) => (
                <fieldset key={entry.id} className="rounded-xl border border-slate-200 p-4">
                  <legend className="px-1 text-sm font-bold text-slate-800">
                    고정닉 {index + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      닉네임
                      <input
                        value={entry.nickname}
                        maxLength={10}
                        required
                        className={fieldClass}
                        placeholder="예: 검술만삼십년"
                        onChange={event => update(entry.id, { nickname: event.target.value })}
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      활동 빈도
                      <select
                        value={entry.activity}
                        className={fieldClass}
                        onChange={event =>
                          update(entry.id, {
                            activity: event.target.value as FixedNickname['activity'],
                          })
                        }
                      >
                        <option value="frequent">자주 등장</option>
                        <option value="occasional">가끔 등장</option>
                        <option value="rare">드물게 등장</option>
                      </select>
                    </label>
                    <label className="text-sm text-slate-700 sm:col-span-2">
                      성격과 입장
                      <textarea
                        value={entry.description}
                        maxLength={200}
                        rows={2}
                        className={fieldClass}
                        placeholder="예: 정파 출신의 고참. 실전을 중시하고 허풍을 싫어한다."
                        onChange={event => update(entry.id, { description: event.target.value })}
                      />
                    </label>
                    <label className="text-sm text-slate-700 sm:col-span-2">
                      말투
                      <input
                        value={entry.speechStyle}
                        maxLength={120}
                        className={fieldClass}
                        placeholder="예: 짧은 반말, 가끔 옛 무림 속담을 인용한다."
                        onChange={event => update(entry.id, { speechStyle: event.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="mt-3 text-sm text-red-700 underline"
                    aria-label={`고정닉 ${index + 1} 삭제`}
                    onClick={() =>
                      setDraft(previous => previous.filter(item => item.id !== entry.id))
                    }
                  >
                    삭제
                  </button>
                </fieldset>
              ))}
            </div>
            {!draft.length && (
              <p className="my-4 text-sm text-slate-600">
                등록된 고정닉이 없습니다. 설정하지 않아도 갤러리를 생성할 수 있습니다.
              </p>
            )}
            <button
              type="button"
              disabled={draft.length >= 8}
              className="my-4 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() =>
                setDraft(previous => [
                  ...previous,
                  {
                    id: crypto.randomUUID(),
                    nickname: '',
                    description: '',
                    speechStyle: '',
                    activity: 'occasional',
                  },
                ])
              }
            >
              고정닉 추가
            </button>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                고정닉 저장
              </button>
            </div>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  );
};
