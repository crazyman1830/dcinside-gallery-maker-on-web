import { useCallback, useState, useSyncExternalStore } from 'react';

export type GalleryListSort = 'original' | 'latest' | 'recommendations' | 'comments';

interface GalleryListState {
  query: string;
  sort: GalleryListSort;
  page: number;
}

interface SavedListState {
  controls: GalleryListState;
  scrollTop: number;
}

const initialState: GalleryListState = { query: '', sort: 'original', page: 1 };
const storagePrefix = 'gallery-list-state:';
const memory = new Map<string, SavedListState>();
const listeners = new Map<string, Set<() => void>>();

const readState = (galleryId: string): SavedListState => {
  const cached = memory.get(galleryId);
  if (cached) return cached;
  let saved: SavedListState = { controls: initialState, scrollTop: 0 };
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storagePrefix + galleryId) ?? 'null');
    if (value && typeof value === 'object') {
      const data = value as Record<string, unknown>;
      saved = {
        controls: {
          query: typeof data.query === 'string' ? data.query : '',
          sort:
            data.sort === 'latest' || data.sort === 'recommendations' || data.sort === 'comments'
              ? data.sort
              : 'original',
          page: Number.isSafeInteger(data.page) && Number(data.page) > 0 ? Number(data.page) : 1,
        },
        scrollTop:
          typeof data.scrollTop === 'number' && Number.isFinite(data.scrollTop)
            ? Math.max(0, data.scrollTop)
            : 0,
      };
    }
  } catch {
    // Browsing the gallery still works when storage is unavailable or malformed.
  }
  memory.set(galleryId, saved);
  return saved;
};

const persistState = (galleryId: string, saved: SavedListState) => {
  memory.set(galleryId, saved);
  try {
    sessionStorage.setItem(
      storagePrefix + galleryId,
      JSON.stringify({ ...saved.controls, scrollTop: saved.scrollTop }),
    );
  } catch {
    // The in-memory copy preserves navigation state for the rest of this visit.
  }
};

export const getGalleryListScrollPosition = (galleryId: string) => readState(galleryId).scrollTop;

export const rememberGalleryListScrollPosition = (galleryId: string, scrollTop: number) => {
  if (!Number.isFinite(scrollTop)) return;
  const saved = readState(galleryId);
  const next = Math.max(0, scrollTop);
  if (saved.scrollTop !== next) persistState(galleryId, { ...saved, scrollTop: next });
};

export const useGalleryListState = (galleryId?: string) => {
  const [localState, setLocalState] = useState(initialState);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!galleryId) return () => undefined;
      const subscribers = listeners.get(galleryId) ?? new Set();
      subscribers.add(notify);
      listeners.set(galleryId, subscribers);
      return () => {
        subscribers.delete(notify);
        if (subscribers.size === 0) listeners.delete(galleryId);
      };
    },
    [galleryId],
  );
  const getSnapshot = useCallback(
    () => (galleryId ? readState(galleryId).controls : initialState),
    [galleryId],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, () => initialState);
  const updateState = useCallback(
    (update: Partial<GalleryListState>) => {
      if (!galleryId) {
        setLocalState(previous => ({ ...previous, ...update }));
        return;
      }
      const saved = readState(galleryId);
      persistState(galleryId, { ...saved, controls: { ...saved.controls, ...update } });
      listeners.get(galleryId)?.forEach(notify => notify());
    },
    [galleryId],
  );
  return { state: galleryId ? state : localState, updateState };
};
