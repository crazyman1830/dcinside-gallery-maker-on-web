import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { GallerySessionV2 } from '../types';
import {
  deleteLibraryEntry,
  listLibraryEntries,
  MAX_BACKUP_BYTES,
  parseGalleryBackup,
  serializeGalleryBackup,
  writeLibraryEntry,
  validateLibrarySession,
  type LibraryEntry,
} from '../services/galleryLibrary';
import { Icon } from './Icon';

const BASE_REVISION_KEY = 'dcgm.library.base.';

// Tab-scoped lineage survives reloads without adopting revisions from another tab's refresh.
const readBaseRevision = (id: string): number | null => {
  try {
    const value = Number(sessionStorage.getItem(`${BASE_REVISION_KEY}${id}`));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};
const sessionContent = (session: GallerySessionV2) => {
  const clean = validateLibrarySession(session);
  return JSON.stringify([clean.gallery, clean.context, clean.profile]);
};

interface Props {
  ref?: Ref<{ saveCurrent: () => Promise<boolean> }>;
  session: GallerySessionV2 | null;
  disabled: boolean;
  onOpen: (session: GallerySessionV2) => void;
}

export const GalleryLibrary = ({ session, disabled, onOpen, ref }: Props) => {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [initialSession] = useState(session);
  const baseRevisions = useRef(new Map<string, number>());
  const running = useRef(false);
  const rememberBaseRevision = useCallback((id: string, revision: number) => {
    baseRevisions.current.set(id, revision);
    try {
      sessionStorage.setItem(`${BASE_REVISION_KEY}${id}`, String(revision));
    } catch {
      // In-memory conflict protection still works if tab storage is unavailable.
    }
  }, []);
  const refresh = useCallback(async () => {
    const loaded = await listLibraryEntries();
    setEntries(loaded);
    return loaded;
  }, []);
  const run = useCallback(async (operation: () => Promise<void>) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      await operation();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '보관함 작업에 실패했습니다.');
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void run(async () => {
      const loaded = await refresh();
      if (!initialSession || initialSession.context.useSearch) return;
      const existing = loaded.find(entry => entry.id === initialSession.context.worldlineId);
      if (!existing || readBaseRevision(existing.id) !== null) return;
      if (sessionContent(existing.session) === sessionContent(initialSession)) {
        rememberBaseRevision(existing.id, existing.revision);
      }
    });
  }, [run, refresh, initialSession, rememberBaseRevision]);
  const saveCurrent = useCallback(async () => {
    if (!session || session.context.useSearch) return true;
    return run(async () => {
      const existing = entries.find(entry => entry.id === session.context.worldlineId);
      const id = session.context.worldlineId;
      const baseRevision = baseRevisions.current.get(id) ?? readBaseRevision(id);
      const saved = await writeLibraryEntry(session, baseRevision, existing?.name);
      rememberBaseRevision(saved.id, saved.revision);
      await refresh();
      setMessage('현재 갤러리를 보관했습니다.');
    });
  }, [session, entries, run, refresh, rememberBaseRevision]);
  useImperativeHandle(ref, () => ({ saveCurrent }), [saveCurrent]);
  const openEntry = async (entry: LibraryEntry) => {
    if (session?.context.worldlineId !== entry.id && !(await saveCurrent())) return;
    await run(async () => {
      const validated = parseGalleryBackup(serializeGalleryBackup(entry.session));
      rememberBaseRevision(entry.id, entry.revision);
      setRestoring(null);
      onOpen(validated);
    });
  };
  const locked = disabled || busy;
  const exportSession = (value: GallerySessionV2) => {
    const text = serializeGalleryBackup(value);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `gallery-${value.context.worldlineId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const buttonClass =
    'inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';
  const quietButtonClass =
    'rounded-md px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';
  return (
    <details className="group mb-5 rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
        <span>갤러리 보관함 ({entries.length}/50)</span>
        <Icon
          icon="fas fa-chevron-down"
          className="text-xs text-slate-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        <p className="mb-3 text-sm text-slate-600">
          새 갤러리 생성과 다른 갤러리 열기 전에 현재 결과를 자동 보관합니다. 직접 보관하면 그
          시점의 글과 댓글을 저장합니다. 이 브라우저에만 보관됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={locked || !session || session.context.useSearch}
            onClick={() => void saveCurrent()}
          >
            <Icon icon="fas fa-save" className="mr-2 text-slate-400" />
            현재 갤러리 보관
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={locked || !session || session.context.useSearch}
            onClick={() =>
              void run(async () => {
                if (session) exportSession(session);
              })
            }
          >
            현재 갤러리 내보내기
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={locked}
            onClick={() =>
              void run(async () => {
                await refresh();
              })
            }
          >
            보관함 새로고침
          </button>
          <label
            className={`${buttonClass} cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}
          >
            <Icon icon="fas fa-file-import" className="mr-2 text-slate-400" />
            백업 가져오기
            <input
              type="file"
              accept=".json,application/json"
              disabled={locked}
              className="sr-only"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void run(async () => {
                  if (file.size > MAX_BACKUP_BYTES)
                    throw new Error('백업은 8 MiB 이하여야 합니다.');
                  await writeLibraryEntry(parseGalleryBackup(await file.text()), null);
                  await refresh();
                  setMessage('백업을 보관함에 추가했습니다.');
                });
              }}
            />
          </label>
        </div>
        {message && (
          <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        )}
        {entries.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
            아직 보관한 갤러리가 없습니다. 새 갤러리를 만들거나 백업을 가져오면 이곳에 쌓입니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {entries.map(entry => {
              const isCurrent = session?.context.worldlineId === entry.id;
              return (
                <li
                  key={entry.id}
                  className={`space-y-2 rounded-lg border p-3 ${isCurrent ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-slate-800">
                        {entry.name}
                        {isCurrent && (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-blue-700">
                            지금 보는 갤러리
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {entry.id} · 글 {entry.session.gallery.posts.length}개 ·{' '}
                        {new Date(entry.session.savedAt).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={locked}
                      onClick={() => {
                        if (isCurrent) setRestoring(entry.id);
                        else void openEntry(entry);
                      }}
                    >
                      {isCurrent ? '저장본으로 되돌리기' : '열기'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={quietButtonClass}
                      disabled={locked}
                      onClick={() => void run(async () => exportSession(entry.session))}
                    >
                      내보내기
                    </button>
                    <button
                      type="button"
                      className={quietButtonClass}
                      disabled={locked}
                      onClick={() => {
                        setEditing(entry.id);
                        setName(entry.name);
                      }}
                    >
                      이름 변경
                    </button>
                    <button
                      type="button"
                      className={`${quietButtonClass} hover:bg-red-50 hover:text-red-700`}
                      disabled={locked}
                      onClick={() => setDeleting(entry.id)}
                    >
                      삭제
                    </button>
                  </div>
                  {restoring === entry.id && (
                    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                      <p>
                        저장본을 열면 현재 화면에서 보관하지 않은 변경 내용이 사라집니다. 필요한
                        내용은 먼저 현재 갤러리를 내보내주세요.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={locked}
                          onClick={() => void openEntry(entry)}
                        >
                          저장본 열기
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => setRestoring(null)}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                  {editing === entry.id && (
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={event => {
                        event.preventDefault();
                        void run(async () => {
                          const renamed = await writeLibraryEntry(
                            entry.session,
                            entry.revision,
                            name,
                          );
                          const baseRevision =
                            baseRevisions.current.get(entry.id) ?? readBaseRevision(entry.id);
                          if (baseRevision === entry.revision)
                            rememberBaseRevision(entry.id, renamed.revision);
                          setEditing(null);
                          await refresh();
                        });
                      }}
                    >
                      <input
                        aria-label="보관함 이름"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={name}
                        maxLength={200}
                        required
                        onChange={event => setName(event.target.value)}
                      />
                      <button className={buttonClass} disabled={locked}>
                        이름 저장
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => setEditing(null)}
                      >
                        취소
                      </button>
                    </form>
                  )}
                  {deleting === entry.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                      <span className="text-red-900">
                        이 보관 항목을 삭제할까요? 현재 열려 있는 갤러리는 유지됩니다.
                      </span>
                      <button
                        type="button"
                        className={`${buttonClass} border-red-300 text-red-700 hover:bg-red-100`}
                        disabled={locked}
                        onClick={() =>
                          void run(async () => {
                            await deleteLibraryEntry(entry.id, entry.revision);
                            baseRevisions.current.delete(entry.id);
                            try {
                              sessionStorage.removeItem(`${BASE_REVISION_KEY}${entry.id}`);
                            } catch {
                              // Keep the completed deletion even if tab storage is unavailable.
                            }
                            setDeleting(null);
                            await refresh();
                          })
                        }
                      >
                        삭제 확인
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => setDeleting(null)}
                      >
                        취소
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
};
