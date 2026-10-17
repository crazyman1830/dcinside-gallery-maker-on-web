// @vitest-environment jsdom

import type { SetStateAction } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Comment,
  CreateGalleryParams,
  GalleryData,
  GalleryContextParams,
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

const requestContext: CreateGalleryParams = {
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

const context: GalleryContextParams = {
  ...requestContext,
  worldlineId: 'WL-1111-2222-3333',
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
  galleryContext: GalleryContextParams | null;
  currentUserProfile: UserProfile | null;
  revision: number;
  storageWarning: string | null;
  selectedPostId: string | null;
  setGalleryData: ReturnType<typeof vi.fn>;
  setGalleryDataDeferred: ReturnType<typeof vi.fn>;
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
  isStreaming: boolean;
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
  setIsStreaming: ReturnType<typeof vi.fn>;
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
    setGalleryDataDeferred: vi.fn((value: SetStateAction<GalleryData | null>) => {
      storage.galleryData = typeof value === 'function' ? value(storage.galleryData) : value;
    }),
    replaceSession: vi.fn(
      (data: GalleryData, nextContext: GalleryContextParams, nextProfile: UserProfile) => {
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
    isStreaming: false,
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
    setIsStreaming: vi.fn((value: boolean) => {
      ui.isStreaming = value;
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
      ui.isStreaming = true;
      ui.error = null;
    }),
  };

  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGallery gallery generation', () => {
  it('appends new posts on the same worldline without changing old votes', async () => {
    const previous = structuredClone(storage.galleryData);
    const generated = makeGallery(makePost('new-post'));
    vi.mocked(galleryService.createGalleryStreamed).mockResolvedValueOnce(generated);
    const { result } = renderGalleryHook();
    await act(async () => {
      expect(
        await result.current.createGallery({ ...requestContext, userProfile: profile }, true),
      ).toBe(true);
    });
    expect(storage.galleryContext?.worldlineId).toBe(context.worldlineId);
    expect(storage.galleryData?.posts).toEqual([...generated.posts, ...previous!.posts]);
    const request = vi.mocked(galleryService.createGalleryStreamed).mock.calls[0][0];
    expect(request.continuityNotes).toBeUndefined();
    expect(request.continuationContext).toEqual({
      galleryTitle: previous!.galleryTitle,
      totalPostCount: previous!.posts.length,
      recentPosts: previous!.posts.map(post => ({
        title: post.title,
        author: post.author,
        contentExcerpt: post.content,
      })),
    });
    expect(storage.galleryContext?.continuityNotes).toBeUndefined();
    expect(storage.galleryContext).not.toHaveProperty('continuationContext');
  });

  it('preserves long user notes separately from all six continuation samples', async () => {
    const notes = `${'설'.repeat(1993)}끝까지 보존`;
    storage.galleryData!.posts = Array.from({ length: 10 }, (_, index) =>
      makePost(`existing-${index}`, {
        title: `${index}${'제'.repeat(199)}`,
        content: `${index}${'본'.repeat(1000)}`,
      }),
    );
    vi.mocked(galleryService.createGalleryStreamed).mockResolvedValueOnce(
      makeGallery(makePost('new-post')),
    );
    const { result } = renderGalleryHook();
    await act(async () => {
      expect(
        await result.current.createGallery(
          { ...requestContext, userProfile: profile, continuityNotes: notes },
          true,
        ),
      ).toBe(true);
    });

    const request = vi.mocked(galleryService.createGalleryStreamed).mock.calls[0][0];
    expect(request.continuityNotes).toBe(notes);
    expect(request.continuationContext?.totalPostCount).toBe(10);
    expect(request.continuationContext?.recentPosts).toHaveLength(6);
    expect(request.continuationContext?.recentPosts[5]).toEqual({
      title: `5${'제'.repeat(199)}`,
      author: 'author-existing-5',
      contentExcerpt: `5${'본'.repeat(299)}`,
    });
    expect(storage.galleryContext?.continuityNotes).toBe(notes);
    expect(storage.galleryContext).not.toHaveProperty('continuationContext');
  });

  it('does not start continuation above the post limit or for search-based galleries', async () => {
    storage.galleryData = {
      galleryTitle: 'full',
      posts: Array.from({ length: 196 }, (_, index) => makePost(String(index))),
    };
    const { result } = renderGalleryHook();
    await act(async () => {
      expect(
        await result.current.createGallery({ ...requestContext, userProfile: profile }, true),
      ).toBe(false);
    });
    storage.galleryContext!.useSearch = true;
    await act(async () => {
      expect(
        await result.current.createGallery({ ...requestContext, userProfile: profile }, true),
      ).toBe(false);
    });
    expect(galleryService.createGalleryStreamed).not.toHaveBeenCalled();
  });
  it('keeps the old session until a complete result atomically replaces it', async () => {
    const previousGallery = storage.galleryData;
    const warning: GenerationWarning = {
      code: 'COMMENTS_PARTIAL',
      message: 'some comments were skipped',
      stage: 'comments',
    };
    const nextGallery = { ...makeGallery(makePost('generated')), warnings: [warning] };
    const deferred = makeDeferred<GalleryData>();
    let emitChunk: (text: string) => void = () => undefined;
    vi.mocked(galleryService.createGalleryStreamed).mockImplementation(
      (_params, onChunk, _signal, onPhase) => {
        emitChunk = onChunk;
        onChunk('partial payload');
        onPhase?.('posts', 'building posts', 70);
        return deferred.promise;
      },
    );
    const { result } = renderGalleryHook();

    let request = Promise.resolve(false);
    act(() => {
      request = result.current.createGallery({ ...requestContext, userProfile: profile });
    });

    const streamedRequest = vi.mocked(galleryService.createGalleryStreamed).mock.calls[0]?.[0];
    expect(streamedRequest).toEqual({ ...requestContext, userProfile: profile });
    expect(streamedRequest).not.toHaveProperty('worldlineId');
    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.replaceSession).not.toHaveBeenCalled();
    expect(ui.isStreaming).toBe(true);
    expect(ui.setGenerationPhase).toHaveBeenCalledWith('posts');
    expect(ui.setGenerationProgress).toHaveBeenCalledWith(70);
    // Raw chunks must not touch React state: each update would re-render the whole app.
    const uiSetters = Object.values(ui).filter(value => vi.isMockFunction(value));
    const setterCalls = uiSetters.map(setter => setter.mock.calls.length);
    act(() => emitChunk('more payload'));
    expect(uiSetters.map(setter => setter.mock.calls.length)).toEqual(setterCalls);

    deferred.resolve(nextGallery);
    await act(async () => expect(request).resolves.toBe(true));

    expect(storage.replaceSession).toHaveBeenCalledWith(
      nextGallery,
      expect.objectContaining({
        ...requestContext,
        worldlineId: expect.stringMatching(/^WL-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/),
      }),
      profile,
    );
    const storedContext = storage.replaceSession.mock.calls[0]?.[1] as GalleryContextParams;
    expect(storedContext.worldlineId).not.toBe(context.worldlineId);
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
        result.current.createGallery({ ...requestContext, userProfile: profile }),
      ).resolves.toBe(false);
    });

    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.replaceSession).not.toHaveBeenCalled();
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('generation failed'));
  });

  it('reports a worldline generator failure without replacing the previous session', async () => {
    const previousGallery = storage.galleryData;
    vi.stubGlobal('crypto', undefined);
    const { result } = renderGalleryHook();

    await act(async () => {
      await expect(
        result.current.createGallery({ ...requestContext, userProfile: profile }),
      ).resolves.toBe(false);
    });

    expect(galleryService.createGalleryStreamed).not.toHaveBeenCalled();
    expect(storage.galleryData).toBe(previousGallery);
    expect(storage.replaceSession).not.toHaveBeenCalled();
    expect(ui.setError).toHaveBeenCalled();
    expect(ui.setIsLoading).toHaveBeenLastCalledWith(false);
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

    const request = result.current.createGallery({ ...requestContext, userProfile: profile });
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
  it('coalesces retry clicks and preserves a single user comment with current votes', async () => {
    vi.mocked(galleryService.addFollowUpComments).mockRejectedValueOnce(
      new Error('temporary failure'),
    );
    const { result, rerender } = renderGalleryHook();
    await act(async () => {
      await result.current.addUserComment('post-1', 'retry me', 'tester');
    });
    rerender();
    const userComment = storage.galleryData!.posts[0].comments[0];
    expect(result.current.failedReactions['post-1'].commentId).toBe(userComment.id);
    const pending = makeDeferred<Comment[]>();
    vi.mocked(galleryService.addFollowUpComments).mockReturnValueOnce(pending.promise);
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retryReaction('post-1');
    });
    await act(async () => {
      await result.current.retryReaction('post-1');
    });
    expect(galleryService.addFollowUpComments).toHaveBeenCalledTimes(2);
    act(() => result.current.voteComment('post-1', userComment.id, 'rec', 4, 0));
    await act(async () => {
      pending.resolve([makeComment('ai-retry'), makeComment('ai-retry')]);
      await retry;
    });
    expect(storage.galleryData!.posts[0].comments).toHaveLength(2);
    expect(storage.galleryData!.posts[0].comments[0]).toMatchObject({
      id: userComment.id,
      recommendations: 4,
    });
    rerender();
    expect(result.current.failedReactions).toEqual({});
  });

  it('ignores a retry result after opening another stored worldline', async () => {
    vi.mocked(galleryService.addFollowUpComments).mockRejectedValueOnce(
      new Error('temporary failure'),
    );
    const { result, rerender } = renderGalleryHook();
    await act(async () => {
      await result.current.addUserComment('post-1', 'retry me', 'tester');
    });
    rerender();
    const pending = makeDeferred<Comment[]>();
    vi.mocked(galleryService.addFollowUpComments).mockReturnValueOnce(pending.promise);
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retryReaction('post-1');
    });
    const restored = makeGallery(makePost('restored-post'));
    act(() =>
      result.current.openSession({
        version: 2,
        revision: 1,
        savedAt: '2026-09-07T00:00:00.000Z',
        gallery: restored,
        context: { ...context, worldlineId: 'WL-AAAA-BBBB-CCCC' },
        profile,
      }),
    );
    await act(async () => {
      pending.resolve([makeComment('obsolete')]);
      await retry;
    });
    expect(storage.galleryData).toEqual(restored);
    rerender();
    expect(result.current.failedReactions).toEqual({});
    expect(ui.isAddingComment).toBe(false);
  });
  it('handles worldview feedback success, failure, and eligibility', async () => {
    storage.selectedPostId = 'post-1';
    vi.mocked(galleryService.getWorldviewFeedback)
      .mockResolvedValueOnce('useful feedback')
      .mockRejectedValueOnce(new Error('feedback failed'));
    const { result, rerender } = renderGalleryHook();

    expect(result.current.selectedPost?.id).toBe('post-1');
    await act(async () => result.current.fetchWorldviewFeedback());
    expect(ui.setWorldviewFeedback).toHaveBeenCalledWith('useful feedback');
    expect(galleryService.getWorldviewFeedback).toHaveBeenNthCalledWith(
      1,
      context.customWorldviewText,
      storage.galleryData,
      context.selectedModel,
      context.selectedProvider,
      expect.any(AbortSignal),
    );

    await act(async () => result.current.fetchWorldviewFeedback());
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('feedback failed'));

    storage.galleryContext = { ...context, worldviewValue: 'NONE' };
    rerender();
    await act(async () => result.current.fetchWorldviewFeedback());
    expect(galleryService.getWorldviewFeedback).toHaveBeenCalledTimes(2);
    expect(ui.setError).toHaveBeenCalledWith(expect.stringContaining('직접 입력'));
  });
});
