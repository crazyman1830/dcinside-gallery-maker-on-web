import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AppView, GalleryData } from '../types';
import {
  getGalleryListScrollPosition,
  rememberGalleryListScrollPosition,
} from './useGalleryListState';

const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener('hashchange', notify);
  };
};
const readHash = () => window.location.hash;
const writeHash = (hash: string, replace = false) => {
  if (hash === window.location.hash) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};

export const useGalleryNavigation = (
  gallery: GalleryData | null,
  galleryId?: string,
  suspended = false,
) => {
  const hash = useSyncExternalStore(subscribe, readHash, () => '');
  let postId: string | null = null;
  try {
    if (hash.startsWith('#post/')) postId = decodeURIComponent(hash.slice(6));
  } catch {
    // Invalid percent escapes recover to the list without throwing during render.
  }
  const post = gallery?.posts.find(candidate => candidate.id === postId) ?? null;
  const view: AppView = !gallery || hash === '#setup' ? 'setup' : post ? 'post' : 'gallery-list';
  const canonical =
    view === 'post'
      ? `#post/${encodeURIComponent(post!.id)}`
      : view === 'setup'
        ? '#setup'
        : '#gallery';

  useEffect(() => {
    writeHash(canonical, true);
  }, [canonical, hash]);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (suspended) return;
    let ready = false;
    const rememberScroll = () => {
      if (ready && view === 'gallery-list' && galleryId) {
        rememberGalleryListScrollPosition(galleryId, window.scrollY);
      }
    };
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(
          view === 'setup'
            ? 'setup-title'
            : view === 'post'
              ? 'post-title'
              : 'gallery-content-title',
        )
        ?.focus({ preventScroll: true });
      window.scrollTo({
        top: view === 'gallery-list' && galleryId ? getGalleryListScrollPosition(galleryId) : 0,
        behavior: 'auto',
      });
      ready = true;
    });
    window.addEventListener('scroll', rememberScroll, { passive: true });
    window.addEventListener('pagehide', rememberScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', rememberScroll);
      window.removeEventListener('pagehide', rememberScroll);
    };
  }, [view, post?.id, galleryId, suspended]);

  const navigate = useCallback(
    (next: AppView, id?: string, replace = false) => {
      const nextHash =
        next === 'post' && id
          ? '#post/' + encodeURIComponent(id)
          : next === 'setup'
            ? '#setup'
            : '#gallery';
      if (nextHash === window.location.hash) return;
      if (!suspended && view === 'gallery-list' && galleryId) {
        rememberGalleryListScrollPosition(galleryId, window.scrollY);
      }
      writeHash(nextHash, replace);
    },
    [galleryId, view, suspended],
  );

  return { view, post, navigate };
};
