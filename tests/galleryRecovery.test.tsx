// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGallery } from '../hooks/useGallery';
import { SESSION_STORAGE_KEY } from '../hooks/useGalleryStorage';
import * as service from '../services/galleryService';
import { DEFAULT_MODEL_BY_PROVIDER } from '../constants';
import type { AddUserPostResponse, Comment, GallerySessionV2 } from '../types';

vi.mock('../services/galleryService', async original => ({
  ...(await original<typeof import('../services/galleryService')>()),
  addFollowUpComments: vi.fn(),
  retryPostStage: vi.fn(),
  createGalleryStreamed: vi.fn(),
}));
const session: GallerySessionV2 = {
  version: 2,
  revision: 1,
  savedAt: '2026-10-03T00:00:00.000Z',
  context: {
    worldlineId: 'WL-1111-2222-3333',
    topic: '무공',
    discussionContext: '대회 개최',
    worldviewValue: 'MURIM',
    worldviewEraValue: 'ANCIENT',
    toxicityLevelValue: 'MILD',
    anonymousNickRatioValue: 'BALANCED',
    userSpecies: '',
    userAffiliation: '',
    genderRatioValue: 'AUTO',
    ageRangeValue: 'AUTO',
    selectedProvider: 'gemini',
    selectedModel: DEFAULT_MODEL_BY_PROVIDER.gemini,
    useSearch: false,
  },
  profile: { nicknameType: 'FIXED', nickname: '독자', reputation: 50 },
  gallery: {
    galleryTitle: '무공 갤러리',
    posts: [
      {
        id: 'post-1',
        title: '대회 소식',
        author: '검객',
        content: '비무대회가 열린다.',
        timestamp: '2026-10-03T00:00:00.000Z',
        views: 100,
        recommendations: 3,
        nonRecommendations: 0,
        comments: [],
      },
    ],
  },
};
const aiComment: Comment = {
  id: 'ai-response',
  author: '구경꾼',
  text: '흥미롭다.',
  timestamp: '2026-10-03T01:00:00.000Z',
  recommendations: 0,
  nonRecommendations: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('persistent reaction recovery and continuation', () => {
  it('retains two failed comments across reload and retries exactly the selected one', async () => {
    vi.mocked(service.addFollowUpComments).mockRejectedValue(new Error('일시적인 장애'));
    const first = renderHook(() => useGallery());
    await act(async () => {
      await first.result.current.addUserComment('post-1', '첫 댓글', '독자');
    });
    await act(async () => {
      await first.result.current.addUserComment('post-1', '둘째 댓글', '독자');
    });
    expect(first.result.current.failedReactionList).toHaveLength(2);
    const firstId = first.result.current.failedReactionList[0].commentId;
    first.unmount();
    const restored = renderHook(() => useGallery());
    expect(restored.result.current.failedReactionList).toHaveLength(2);
    vi.mocked(service.addFollowUpComments).mockResolvedValueOnce([aiComment]);
    await act(async () => {
      await restored.result.current.retryReaction('post-1', firstId);
    });
    expect(restored.result.current.failedReactionList).toHaveLength(1);
    expect(restored.result.current.galleryData!.posts[0].comments).toHaveLength(3);
    expect(
      restored.result.current.galleryData!.posts[0].comments.filter(
        comment => comment.id === firstId,
      ),
    ).toHaveLength(1);
    expect(
      restored.result.current.galleryData!.posts[0].comments.find(
        comment => comment.id === firstId,
      ),
    ).not.toHaveProperty('reactionFailure');
  });

  it('recovers one failed stage without erasing another warning or votes added while waiting', async () => {
    const input = structuredClone(session);
    input.gallery.warnings = [
      {
        code: 'POST_EVALUATION_FALLBACK',
        stage: 'evaluation',
        postId: 'post-1',
        message: '평가 실패',
      },
      { code: 'POST_COMMENTS_FALLBACK', stage: 'comments', postId: 'post-1', message: '댓글 실패' },
    ];
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(input));
    let resolve!: (result: AddUserPostResponse) => void;
    vi.mocked(service.retryPostStage).mockReturnValueOnce(
      new Promise(value => {
        resolve = value;
      }),
    );
    const hook = renderHook(() => useGallery());
    let pending!: Promise<boolean>;
    act(() => {
      pending = hook.result.current.retryFailedStage('post-1', 'evaluation');
    });
    await act(async () => {
      expect(await hook.result.current.retryFailedStage('post-1', 'evaluation')).toBe(false);
    });
    act(() => {
      hook.result.current.votePost('post-1', 'rec', 4, 0);
    });
    await act(async () => {
      resolve({
        post: { ...input.gallery.posts[0], views: 200, recommendations: 10 },
        warnings: [],
      });
      await pending;
    });
    expect(service.retryPostStage).toHaveBeenCalledTimes(1);
    expect(hook.result.current.galleryData!.posts[0]).toMatchObject({
      recommendations: 11,
      voted: 'rec',
      views: 200,
    });
    expect(hook.result.current.galleryData!.warnings).toEqual([input.gallery.warnings[1]]);
  });

  it('appends five posts with a new event and fixed handles while preserving failed comments', async () => {
    vi.mocked(service.addFollowUpComments).mockRejectedValueOnce(new Error('장애'));
    const hook = renderHook(() => useGallery());
    await act(async () => {
      await hook.result.current.addUserComment('post-1', '이어갈 댓글', '독자');
    });
    const oldPost = structuredClone(hook.result.current.galleryData!.posts[0]);
    const fixedNicknames = [
      {
        id: 'regular-1',
        nickname: '검술고수',
        description: '정파 출신',
        speechStyle: '짧은 반말',
        activity: 'frequent' as const,
      },
    ];
    act(() => {
      hook.result.current.saveFixedNicknames(fixedNicknames);
    });
    vi.mocked(service.createGalleryStreamed).mockResolvedValueOnce({
      galleryTitle: '무공 갤러리',
      posts: Array.from({ length: 5 }, (_, index) => ({
        ...session.gallery.posts[0],
        id: `new-${index}`,
      })),
    });
    await act(async () => {
      expect(
        await hook.result.current.createGallery(
          {
            ...hook.result.current.galleryContext!,
            discussionContext: '승부조작 의혹',
            userProfile: session.profile!,
          },
          true,
        ),
      ).toBe(true);
    });
    expect(hook.result.current.galleryContext).toMatchObject({
      worldlineId: session.context.worldlineId,
      discussionContext: '승부조작 의혹',
      fixedNicknames,
    });
    expect(hook.result.current.galleryData!.posts).toHaveLength(6);
    expect(hook.result.current.galleryData!.posts.at(-1)).toEqual(oldPost);
    expect(hook.result.current.failedReactionList).toHaveLength(1);
    expect(service.createGalleryStreamed).toHaveBeenCalledWith(
      expect.objectContaining({
        discussionContext: '승부조작 의혹',
        fixedNicknames,
        continuationContext: expect.objectContaining({ totalPostCount: 1 }),
      }),
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });
});
