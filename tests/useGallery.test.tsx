// @vitest-environment jsdom

import type { SetStateAction } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Comment,
  CreateGalleryParams,
  GalleryData,
  GenerationWarning,
  Post,
  UserProfile,
} from '../types';
import * as galleryService from '../services/galleryService';
import { useGalleryStorage } from '../hooks/useGalleryStorage';
import { useUIState } from '../hooks/useUIState';
import { useGallery } from '../hooks/useGallery';
import { MAX_TOTAL_COMMENTS_PER_POST } from '../constants';

vi.mock('../services/galleryService', async importOriginal => {
  const original = await importOriginal<typeof import('../services/galleryService')>();
  return {
    ...original,
    createGalleryStreamed: vi.fn(),
    addUserPost: vi.fn(),
    addFollowUpComments: vi.fn(),
    getWorldviewFeedback: vi.fn(),
  };
});

vi.mock('../hooks/useGalleryStorage', () => ({ useGalleryStorage: vi.fn() }));
vi.mock('../hooks/useUIState', () => ({ useUIState: vi.fn() }));

const profile: UserProfile = {
  nicknameType: 'FIXED',
  nickname: 'tester',
  reputation: 50,
};

const context: CreateGalleryParams = {
  topic: 'topic',
  discussionContext: '',
  worldviewValue: 'CUSTOM',
  customWorldviewText: 'world',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MILD',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel: 'gemini-2.5-flash',
  useSearch: false,
  userProfile: profile,
};

const makeComment = (id: string, overrides: Partial<Comment> = {}): Comment => ({
  id,
  author: `author-${id}`,
  text: `comment-${id}`,
  timestamp: '2026-01-01T00:00:00.000Z',
  recommendations: 1,
  nonRecommendations: 0,
  ...overrides,
});

const makePost = (id: string, overrides: Partial<Post> = {}): Post => ({
  id,
  title: `post-${id}`,
  author: `author-${id}`,
  timestamp: '2026-01-01T00:00:00.000Z',
  content: 'content',
  views: 1,
  recommendations: 2,
  nonRecommendations: 0,
  comments: [],
  ...overrides,
});

const makeGallery = (post = makePost('post-1')): GalleryData => ({
  galleryTitle: 'gallery',
  posts: [post],
});

const makeDeferred = <T,>() => {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

type StorageHook = ReturnType<typeof useGalleryStorage>;
type UIHook = ReturnType<typeof useUIState>;

interface StorageHarness {
  galleryData: GalleryData | null;
  galleryContext: CreateGalleryParams | null;
  currentUserProfile: UserProfile | null;
  revision: number;
  storageWarning: string | null;
  selectedPostId: string | null;
  setGalleryData: ReturnType<typeof vi.fn>;
  replaceSession: ReturnType<typeof vi.fn>;
  setSelectedPostId: ReturnType<typeof vi.fn>;
  selectPost: ReturnType<typeof vi.fn>;
  backToList: ReturnType<typeof vi.fn>;
}

interface UIHarness {
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  warningMessage: string | null;
  isWriteModalOpen: boolean;
  isSavingUserPost: boolean;
  isAddingComment: boolean;
  highlightedCommentIds: Set<string>;
  streamingText: string | null;
  generationPhase: string;
  generationMessage: string;
  generationProgress: number | null;
  worldviewFeedback: string | null;
  isFetchingFeedback: boolean;
  setIsLoading: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setSuccessMessage: ReturnType<typeof vi.fn>;
  setWarningMessage: ReturnType<typeof vi.fn>;
  openWriteModal: ReturnType<typeof vi.fn>;
  closeWriteModal: ReturnType<typeof vi.fn>;
  setIsSavingUserPost: ReturnType<typeof vi.fn>;
  setIsAddingComment: ReturnType<typeof vi.fn>;
  triggerCommentHighlight: ReturnType<typeof vi.fn>;
  setStreamingText: ReturnType<typeof vi.fn>;
  setGenerationPhase: ReturnType<typeof vi.fn>;
  setGenerationMessage: ReturnType<typeof vi.fn>;
  setGenerationProgress: ReturnType<typeof vi.fn>;
  setWorldviewFeedback: ReturnType<typeof vi.fn>;
  setIsFetchingFeedback: ReturnType<typeof vi.fn>;
  resetForNewGeneration: ReturnType<typeof vi.fn>;
}

let storage: StorageHarness;
let ui: UIHarness;

const renderGalleryHook = () => {
  vi.mocked(useGalleryStorage).mockReturnValue(storage as unknown as StorageHook);
  vi.mocked(useUIState).mockReturnValue(ui as unknown as UIHook);
  return renderHook(() => useGallery());
};

beforeEach(() => {
  vi.clearAllMocks();
  const initialGallery = makeGallery();
  storage = {
    galleryData: initialGallery,
    galleryContext: { ...context },
    currentUserProfile: profile,
    revision: 4,
    storageWarning: null,
    selectedPostId: null,
    setGalleryData: vi.fn((value: SetStateAction<GalleryData | null>) => {
      storage.galleryData = typeof value === 'function' ? value(storage.galleryData) : value;
    }),
    replaceSession: vi.fn(
      (data: GalleryData, nextContext: CreateGalleryParams, nextProfile: UserProfile) => {
        storage.galleryData = data;
        storage.galleryContext = nextContext;
        storage.currentUserProfile = nextProfile;
        storage.revision += 1;
      },
    ),
    setSelectedPostId: vi.fn((postId: string | null) => {
      storage.selectedPostId = postId;
    }),
    selectPost: vi.fn(),
    backToList: vi.fn(),
  };

  ui = {
    isLoading: false,
    error: null,
    successMessage: null,
    warningMessage: null,
    isWriteModalOpen: false,
    isSavingUserPost: false,
    isAddingComment: false,
    highlightedCommentIds: new Set(),
    streamingText: null,
    generationPhase: 'connecting',
    generationMessage: 'connecting',
    generationProgress: null,
    worldviewFeedback: null,
    isFetchingFeedback: false,
    setIsLoading: vi.fn((value: boolean) => {
      ui.isLoading = value;
    }),
    setError: vi.fn((value: string | null) => {
      ui.error = value;
    }),
    setSuccessMessage: vi.fn((value: string | null) => {
      ui.successMessage = value;
    }),
    setWarningMessage: vi.fn((value: string | null) => {
      ui.warningMessage = value;
    }),
    openWriteModal: vi.fn(() => {
      ui.isWriteModalOpen = true;
    }),
    closeWriteModal: vi.fn(() => {
      ui.isWriteModalOpen = false;
    }),
    setIsSavingUserPost: vi.fn((value: boolean) => {
      ui.isSavingUserPost = value;
    }),
    setIsAddingComment: vi.fn((value: boolean) => {
      ui.isAddingComment = value;
    }),
    triggerCommentHighlight: vi.fn((ids: Set<string>) => {
      ui.highlightedCommentIds = ids;
    }),
    setStreamingText: vi.fn((value: SetStateAction<string | null>) => {
      ui.streamingText = typeof value === 'function' ? value(ui.streamingText) : value;
    }),
    setGenerationPhase: vi.fn((value: string) => {
      ui.generationPhase = value;
    }),
    setGenerationMessage: vi.fn((value: string) => {
      ui.generationMessage = value;
    }),
    setGenerationProgress: vi.fn((value: number | null) => {
      ui.generationProgress = value;
    }),
    setWorldviewFeedback: vi.fn((value: string | null) => {
      ui.worldviewFeedback = value;
    }),
    setIsFetchingFeedback: vi.fn((value: boolean) => {
      ui.isFetchingFeedback = value;
    }),
    resetForNewGeneration: vi.fn(() => {
      ui.isLoading = true;
      ui.streamingText = '';
      ui.error = null;
    }),
  };

  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGallery gallery generation', () => {
  it('keeps the old session until a complete result atomically replaces it', async () => {
    const previousGallery = storage.galleryData;
    const warning: GenerationWarning = {
      code: 'COMMENTS_PARTIAL',
      message: 'some comments were skipped',
      stage: 'comments',
    };
    const nextGallery = { ...makeGallery(makePost('generated')), warnings: [warning] };
    const deferred = makeDeferred<GalleryData>();
    vi.mocked(galleryService.createGalleryStreamed).mockImplementation(
      (_params, onChunk, _signal, onPhase) => {
        onChunk('partial payload');
        onPhase?.('posts', 'building posts', 70);
        return deferred.promise;
      },
    );
    const { result } = renderGalleryHook();

    let request = Promise.resolve(false);
    act(() => {
      request = result.current.createGallery({ ...context, userProfile: profile });
    });

    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.replaceSession).not.toHaveBeenCalled();
    expect(ui.streamingText).toBe('partial payload');
    expect(ui.setGenerationPhase).toHaveBeenCalledWith('posts');
    expect(ui.setGenerationProgress).toHaveBeenCalledWith(70);

    deferred.resolve(nextGallery);
    await act(async () => expect(request).resolves.toBe(true));

    expect(storage.replaceSession).toHaveBeenCalledWith(
      nextGallery,
      expect.objectContaining(context),
      profile,
    );
    expect(storage.galleryData).toBe(nextGallery);
    expect(ui.setWarningMessage).toHaveBeenCalledWith(expect.stringContaining(warning.message));
    expect(ui.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it('preserves the previous session and reports a generation failure', async () => {
    const previousGallery = storage.galleryData;
    vi.mocked(galleryService.createGalleryStreamed).mockRejectedValue(
      new Error('generation failed'),
    );
    const { result } = renderGalleryHook();

    await act(async () => {
      await expect(
        result.current.createGallery({ ...context, userProfile: profile }),
      ).resolves.toBe(false);
    });

    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.replaceSession).not.toHaveBeenCalled();
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('generation failed'));
  });

  it('cancels an active generation without deleting the previous session', async () => {
    const previousGallery = storage.galleryData;
    vi.mocked(galleryService.createGalleryStreamed).mockImplementation(
      (_params, _onChunk, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          );
        }),
    );
    const { result } = renderGalleryHook();

    const request = result.current.createGallery({ ...context, userProfile: profile });
    act(() => result.current.cancelGeneration());
    await act(async () => expect(request).resolves.toBe(false));

    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.replaceSession).not.toHaveBeenCalled();
    expect(ui.setWarningMessage).toHaveBeenCalledWith(expect.stringContaining('취소'));
  });
});

describe('useGallery posts', () => {
  it('adds a post and retains it when the server returns warnings', async () => {
    const newPost = makePost('new-post');
    const warning: GenerationWarning = {
      code: 'COMMENTS_PARTIAL',
      message: 'post saved without all comments',
      stage: 'comments',
    };
    vi.mocked(galleryService.addUserPost).mockResolvedValue({ post: newPost, warnings: [warning] });
    const { result } = renderGalleryHook();

    await act(async () => {
      await expect(result.current.saveUserPost('title', 'author', 'content')).resolves.toBe(true);
    });

    expect(storage.galleryData?.posts[0]).toEqual(newPost);
    expect(storage.setSelectedPostId).toHaveBeenCalledWith(newPost.id);
    expect(ui.closeWriteModal).toHaveBeenCalled();
    expect(ui.setWarningMessage).toHaveBeenCalledWith(expect.stringContaining(warning.message));
  });

  it('ignores a post response after the session revision changes', async () => {
    const deferred = makeDeferred<Awaited<ReturnType<typeof galleryService.addUserPost>>>();
    vi.mocked(galleryService.addUserPost).mockReturnValue(deferred.promise);
    const previousGallery = storage.galleryData;
    const { result, rerender } = renderGalleryHook();

    const request = result.current.saveUserPost('title', 'author', 'content');
    storage.revision += 1;
    rerender();
    deferred.resolve({ post: makePost('late'), warnings: [] });

    await act(async () => expect(request).resolves.toBe(false));
    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.setGalleryData).not.toHaveBeenCalled();
  });

  it('reports post failures and guards writes without a gallery context', async () => {
    vi.mocked(galleryService.addUserPost).mockRejectedValue(new Error('post failed'));
    const { result } = renderGalleryHook();

    await act(async () => {
      await expect(result.current.saveUserPost('title', 'author', 'content')).resolves.toBe(false);
    });
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('post failed'));

    storage.galleryContext = null;
    await act(async () => {
      await expect(result.current.saveUserPost('title', 'author', 'content')).resolves.toBe(false);
    });
    expect(galleryService.addUserPost).toHaveBeenCalledOnce();
  });
});

describe('useGallery comments', () => {
  it('stores the final allowed comment without requesting an AI follow-up', async () => {
    const comments = Array.from({ length: MAX_TOTAL_COMMENTS_PER_POST - 1 }, (_, index) =>
      makeComment(`existing-${index}`),
    );
    storage.galleryData = makeGallery(makePost('post-1', { comments }));
    const { result } = renderGalleryHook();

    await act(async () => {
      await result.current.addUserComment('post-1', 'reply body', 'tester', {
        commentId: 'existing-0',
        author: 'author-existing-0',
      });
    });

    const saved = storage.galleryData?.posts[0].comments.at(-1);
    expect(saved).toMatchObject({
      text: '@author-existing-0 reply body',
      replyTo: { commentId: 'existing-0', author: 'author-existing-0' },
    });
    expect(storage.galleryData?.posts[0].comments).toHaveLength(MAX_TOTAL_COMMENTS_PER_POST);
    expect(galleryService.addFollowUpComments).not.toHaveBeenCalled();
    expect(ui.triggerCommentHighlight).toHaveBeenCalled();

    await act(async () => {
      await result.current.addUserComment('post-1', 'one too many', 'tester');
    });
    expect(storage.galleryData?.posts[0].comments).toHaveLength(MAX_TOTAL_COMMENTS_PER_POST);
    expect(ui.setError).toHaveBeenCalledWith(
      expect.stringContaining(`${MAX_TOTAL_COMMENTS_PER_POST}`),
    );
    expect(galleryService.addFollowUpComments).not.toHaveBeenCalled();
  });

  it('merges follow-ups by ID without overwriting local votes or the optimistic comment', async () => {
    const existing = makeComment('existing', { voted: 'rec', recommendations: 4 });
    storage.galleryData = makeGallery(makePost('post-1', { comments: [existing] }));
    const aiComment = makeComment('ai-new', { timestamp: '2026-01-01T00:00:02.000Z' });
    vi.mocked(galleryService.addFollowUpComments).mockResolvedValue([
      { ...existing, recommendations: 999 },
      aiComment,
    ]);
    const { result } = renderGalleryHook();

    await act(async () => {
      await result.current.addUserComment('post-1', 'hello', 'reader');
    });

    const merged = storage.galleryData?.posts[0].comments ?? [];
    expect(merged.filter(comment => comment.id === existing.id)).toEqual([existing]);
    expect(merged.some(comment => comment.id.startsWith('user-comment-post-1-'))).toBe(true);
    expect(merged).toContainEqual(aiComment);
    expect(ui.setSuccessMessage).toHaveBeenCalled();
    expect(ui.triggerCommentHighlight).toHaveBeenCalledWith(expect.any(Set));
  });
});

describe('useGallery feedback and local actions', () => {
  it('handles worldview feedback success, failure, and eligibility', async () => {
    storage.selectedPostId = 'post-1';
    vi.mocked(galleryService.getWorldviewFeedback)
      .mockResolvedValueOnce('useful feedback')
      .mockRejectedValueOnce(new Error('feedback failed'));
    const { result, rerender } = renderGalleryHook();

    expect(result.current.selectedPost?.id).toBe('post-1');
    await act(async () => result.current.fetchWorldviewFeedback());
    expect(ui.setWorldviewFeedback).toHaveBeenCalledWith('useful feedback');

    await act(async () => result.current.fetchWorldviewFeedback());
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('feedback failed'));

    storage.galleryContext = { ...context, worldviewValue: 'NONE' };
    rerender();
    await act(async () => result.current.fetchWorldviewFeedback());
    expect(galleryService.getWorldviewFeedback).toHaveBeenCalledTimes(2);
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('직접 입력'));
  });
});
