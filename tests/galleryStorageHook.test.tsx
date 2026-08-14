// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCKED_SEARCH_SESSION_WARNING,
  CORRUPT_SESSION_STORAGE_WARNING,
  SEARCH_SESSION_STORAGE_WARNING,
  SESSION_STORAGE_KEY,
  useGalleryStorage,
} from '../hooks/useGalleryStorage';
import type { GalleryContextParams, GalleryData, UserProfile } from '../types';

const gallery: GalleryData = {
  galleryTitle: '테스트 갤러리',
  posts: [
    {
      id: 'p1',
      title: '글',
      author: '작성자',
      timestamp: '2026-08-14T00:00:00.000Z',
      content: '내용',
      views: 1,
      recommendations: 0,
      nonRecommendations: 0,
      comments: [],
    },
  ],
};

const context: GalleryContextParams = {
  topic: '테스트',
  discussionContext: '',
  worldviewValue: 'NONE',
  customWorldviewText: '',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel: 'gemini-3.5-flash',
  useSearch: false,
};

const profile: UserProfile = {
  nicknameType: 'FIXED',
  nickname: '고정닉',
  reputation: 70,
};

describe('useGalleryStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('atomically replaces a session and exposes navigation helpers', async () => {
    const { result } = renderHook(() => useGalleryStorage());

    expect(result.current.galleryData).toBeNull();
    act(() => result.current.replaceSession(gallery, context, profile));

    await waitFor(() => expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull());
    expect(result.current.revision).toBe(1);
    expect(result.current.currentUserProfile).toEqual(profile);

    act(() => result.current.selectPost('p1'));
    expect(result.current.selectedPostId).toBe('p1');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    act(() => result.current.backToList());
    expect(result.current.selectedPostId).toBeNull();

    act(() => result.current.setSelectedPostId('p1'));
    expect(result.current.selectedPostId).toBe('p1');

    const replacementRevision = result.current.revision;

    act(() => {
      result.current.setGalleryData(previous => ({
        ...previous!,
        galleryTitle: '변경된 갤러리',
      }));
      result.current.setCurrentUserProfile(() => profile);
    });
    expect(result.current.galleryData?.galleryTitle).toBe('변경된 갤러리');
    expect(result.current.revision).toBe(replacementRevision);

    act(() => {
      result.current.setGalleryContext(previous => ({ ...previous!, topic: '새 주제' }));
    });
    expect(result.current.galleryContext?.topic).toBe('새 주제');
    expect(result.current.revision).toBe(replacementRevision + 1);
    await waitFor(() => expect(result.current.storageWarning).toBeNull());
  });

  it('keeps a newly created search-grounded session in memory without persisting it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useGalleryStorage());
    const searchGallery: GalleryData = {
      ...gallery,
      sources: [{ uri: 'https://example.test/source', title: 'source' }],
      searchEntryPoint: {
        renderedContent:
          '<style>.chip{}</style><a href="https://google.com/search?q=test">test</a>',
      },
    };

    act(() =>
      result.current.replaceSession(searchGallery, { ...context, useSearch: true }, profile),
    );

    await waitFor(() => expect(result.current.storageWarning).toBe(SEARCH_SESSION_STORAGE_WARNING));
    expect(result.current.galleryData).toEqual(searchGallery);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not restore or mutate saved V2 or legacy search-grounded sessions', () => {
    const rawSession = JSON.stringify({
      version: 2,
      revision: 8,
      savedAt: '2026-08-14T00:00:00.000Z',
      gallery: {
        ...gallery,
        sources: [{ uri: 'https://example.test/source', title: 'source' }],
        searchEntryPoint: { renderedContent: '<div>provider markup</div>' },
      },
      context: { ...context, useSearch: true },
      profile,
    });
    localStorage.setItem(SESSION_STORAGE_KEY, rawSession);

    const { result, unmount } = renderHook(() => useGalleryStorage());

    expect(result.current.galleryData).toBeNull();
    expect(result.current.galleryContext).toBeNull();
    expect(result.current.storageWarning).toBe(BLOCKED_SEARCH_SESSION_WARNING);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(rawSession);
    unmount();
    localStorage.clear();

    const rawGallery = JSON.stringify({
      ...gallery,
      sources: [{ uri: 'https://example.test/source' }],
    });
    const rawContext = JSON.stringify({ ...context, useSearch: true });
    const rawProfile = JSON.stringify(profile);
    localStorage.setItem('galleryData', rawGallery);
    localStorage.setItem('galleryContext', rawContext);
    localStorage.setItem('userProfile', rawProfile);

    const legacy = renderHook(() => useGalleryStorage()).result;

    expect(legacy.current.galleryData).toBeNull();
    expect(legacy.current.galleryContext).toBeNull();
    expect(legacy.current.storageWarning).toBe(BLOCKED_SEARCH_SESSION_WARNING);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('galleryData')).toBe(rawGallery);
    expect(localStorage.getItem('galleryContext')).toBe(rawContext);
    expect(localStorage.getItem('userProfile')).toBe(rawProfile);
  });

  it('preserves an invalid V2 payload as the final recovery source', () => {
    const rawSession = '{"version":2,"gallery":';
    localStorage.setItem(SESSION_STORAGE_KEY, rawSession);

    const { result } = renderHook(() => useGalleryStorage());

    expect(result.current.galleryData).toBeNull();
    expect(result.current.storageWarning).toBe(CORRUPT_SESSION_STORAGE_WARNING);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(rawSession);
  });

  it('keeps memory state and surfaces a warning if persistence fails', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useGalleryStorage());

    act(() => result.current.replaceSession(gallery, context, profile));

    await waitFor(() => expect(result.current.storageWarning).toMatch(/저장되지 않았/));
    expect(result.current.galleryData).toEqual(gallery);
    expect(setItem).toHaveBeenCalled();
  });
});
