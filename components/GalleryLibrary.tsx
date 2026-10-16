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
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50';
  return (
    <details className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-slate-800">
        갤러리 보관함 ({entries.length}/50)
      </summary>
      <p className="my-3 text-sm text-slate-600">
        새 갤러리 생성과 다른 갤러리 열기 전에 현재 결과를 자동 보관합니다. 직접 보관하면 그 시점의
        글과 댓글을 저장합니다. 이 브라우저에만 보관됩니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={locked || !session || session.context.useSearch}
          onClick={() => void saveCurrent()}
        >
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
        <label className="text-sm text-slate-700">
          백업 가져오기
          <input
            type="file"
            accept=".json,application/json"
            disabled={locked}
            className="ml-2 max-w-full"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void run(async () => {
                if (file.size > MAX_BACKUP_BYTES) throw new Error('백업은 8 MiB 이하여야 합니다.');
                await writeLibraryEntry(parseGalleryBackup(await file.text()), null);
                await refresh();
                setMessage('백업을 보관함에 추가했습니다.');
              });
            }}
          />
        </label>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
      <ul className="mt-3 divide-y divide-slate-200">
        {entries.map(entry => (
          <li key={entry.id} className="space-y-2 py-3">
            <p className="break-words font-medium text-slate-800">{entry.name}</p>
            <p className="text-xs text-slate-600">
              {entry.id} · 글 {entry.session.gallery.posts.length}개 ·{' '}
              {new Date(entry.session.savedAt).toLocaleString('ko-KR')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={locked}
                onClick={() => {
                  if (session?.context.worldlineId === entry.id) setRestoring(entry.id);
                  else void openEntry(entry);
                }}
              >
                {session?.context.worldlineId === entry.id ? '저장본으로 되돌리기' : '열기'}
              </button>
              <button
                className={buttonClass}
                disabled={locked}
                onClick={() => void run(async () => exportSession(entry.session))}
              >
                내보내기
              </button>
              <button
                className={buttonClass}
                disabled={locked}
                onClick={() => {
                  setEditing(entry.id);
                  setName(entry.name);
                }}
              >
                이름 변경
              </button>
              <button
                className={buttonClass}
                disabled={locked}
                onClick={() => setDeleting(entry.id)}
              >
                삭제
              </button>
            </div>
            {restoring === entry.id && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p>
                  저장본을 열면 현재 화면에서 보관하지 않은 변경 내용이 사라집니다. 필요한 내용은
                  먼저 현재 갤러리를 내보내주세요.
                </p>
                <button
                  className={buttonClass}
                  disabled={locked}
                  onClick={() => void openEntry(entry)}
                >
                  저장본 열기
                </button>
                <button className={`${buttonClass} ml-2`} onClick={() => setRestoring(null)}>
                  취소
                </button>
              </div>
            )}
            {editing === entry.id && (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={event => {
                  event.preventDefault();
                  void run(async () => {
                    const renamed = await writeLibraryEntry(entry.session, entry.revision, name);
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
                  className="rounded border border-slate-300 px-2"
                  value={name}
                  maxLength={200}
                  required
                  onChange={event => setName(event.target.value)}
                />
                <button className={buttonClass} disabled={locked}>
                  이름 저장
                </button>
                <button type="button" className={buttonClass} onClick={() => setEditing(null)}>
                  취소
                </button>
              </form>
            )}
            {deleting === entry.id && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>이 보관 항목을 삭제할까요? 현재 열려 있는 갤러리는 유지됩니다.</span>
                <button
                  className={buttonClass}
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
                <button className={buttonClass} onClick={() => setDeleting(null)}>
                  취소
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
};
