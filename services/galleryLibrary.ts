import { gallerySessionV2Schema } from '../schemas';
import type { GallerySessionV2 } from '../types';

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
export const MAX_LIBRARY_GALLERIES = 50;
export interface LibraryEntry {
  id: string;
  name: string;
  revision: number;
  session: GallerySessionV2;
}

export const validateLibrarySession = (value: unknown): GallerySessionV2 => {
  const parsed = gallerySessionV2Schema.safeParse(value);
  if (!parsed.success) throw new Error('올바른 갤러리 백업 파일이 아닙니다.');
  const session = parsed.data;
  if (session.context.useSearch)
    throw new Error('검색 기반 갤러리는 보관하거나 내보낼 수 없습니다.');
  const postIds = new Set<string>();
  for (const post of session.gallery.posts) {
    if (postIds.has(post.id)) throw new Error('게시물 ID가 중복된 백업입니다.');
    postIds.add(post.id);
    if (new Set(post.comments.map(comment => comment.id)).size !== post.comments.length) {
      throw new Error('댓글 ID가 중복된 백업입니다.');
    }
  }
  return session;
};

export const serializeGalleryBackup = (session: GallerySessionV2): string => {
  const text = JSON.stringify(validateLibrarySession(session), null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new Error('백업은 8 MiB 이하여야 합니다.');
  return text;
};

export const parseGalleryBackup = (text: string): GallerySessionV2 => {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new Error('백업은 8 MiB 이하여야 합니다.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON 백업 파일을 읽지 못했습니다.');
  }
  return validateLibrarySession(value);
};

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('dcgm.library.v1', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('galleries', { keyPath: 'id' });
    request.onerror = () => reject(new Error('보관함 저장소를 열지 못했습니다.'));
    request.onblocked = () => reject(new Error('다른 탭을 닫은 뒤 보관함을 다시 열어주세요.'));
    request.onsuccess = () => resolve(request.result);
  });

export const listLibraryEntries = async (): Promise<LibraryEntry[]> => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('galleries', 'readonly');
      const request = tx.objectStore('galleries').getAll(undefined, MAX_LIBRARY_GALLERIES + 1);
      tx.oncomplete = () => {
        try {
          const entries = (request.result as LibraryEntry[]).map(entry => {
            const session = validateLibrarySession(entry.session);
            if (
              entry.id !== session.context.worldlineId ||
              typeof entry.name !== 'string' ||
              !entry.name.trim() ||
              entry.name.length > 200 ||
              !Number.isSafeInteger(entry.revision) ||
              entry.revision < 1
            )
              throw new Error('Invalid entry');
            return { ...entry, session };
          });
          if (entries.length > MAX_LIBRARY_GALLERIES) throw new Error('Too many entries');
          resolve(entries.sort((a, b) => b.session.savedAt.localeCompare(a.session.savedAt)));
        } catch {
          reject(new Error('보관함에 손상된 항목이 있습니다. 원본 데이터는 유지했습니다.'));
        }
      };
      tx.onabort = tx.onerror = () => reject(new Error('보관함을 읽지 못했습니다.'));
    });
  } finally {
    db.close();
  }
};

/** Compare and write inside one IDB transaction so a stale tab cannot overwrite a newer snapshot. */
export const writeLibraryEntry = async (
  session: GallerySessionV2,
  expectedRevision: number | null,
  name = session.gallery.galleryTitle,
): Promise<LibraryEntry> => {
  const clean = parseGalleryBackup(serializeGalleryBackup(session));
  if (!name.trim() || name.trim().length > 200) throw new Error('이름은 1~200자로 입력해주세요.');
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('galleries', 'readwrite');
      const store = tx.objectStore('galleries');
      const existing = store.get(clean.context.worldlineId);
      const count = store.count();
      let entry: LibraryEntry;
      let failure = '보관함에 저장하지 못했습니다. 저장 공간을 확인해주세요.';
      count.onsuccess = () => {
        const previous = existing.result as LibraryEntry | undefined;
        if ((previous?.revision ?? null) !== expectedRevision) {
          failure =
            '다른 탭에서 변경되었거나 같은 세계선이 이미 있습니다. 현재 갤러리를 내보낸 뒤 보관함을 새로고침하고 최신 저장본을 열어주세요. 새로고침만으로 현재 내용을 덮어쓸 수는 없습니다.';
          tx.abort();
          return;
        }
        if (!previous && count.result >= MAX_LIBRARY_GALLERIES) {
          failure = '보관함은 최대 50개입니다. 백업 후 사용하지 않는 항목을 삭제해주세요.';
          tx.abort();
          return;
        }
        entry = {
          id: clean.context.worldlineId,
          name: name.trim(),
          revision: (previous?.revision ?? 0) + 1,
          session: clean,
        };
        store.put(entry);
      };
      tx.oncomplete = () => resolve(entry);
      tx.onabort = tx.onerror = () => reject(new Error(failure));
    });
  } finally {
    db.close();
  }
};

export const deleteLibraryEntry = async (id: string, expectedRevision: number): Promise<void> => {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('galleries', 'readwrite');
      const store = tx.objectStore('galleries');
      const request = store.get(id);
      request.onsuccess = () => {
        if ((request.result as LibraryEntry | undefined)?.revision !== expectedRevision) {
          tx.abort();
          return;
        }
        store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(new Error('항목이 변경되어 삭제하지 않았습니다. 보관함을 새로고침해주세요.'));
    });
  } finally {
    db.close();
  }
};
