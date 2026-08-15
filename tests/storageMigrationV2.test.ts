import { describe, expect, it } from 'vitest';
import {
  LEGACY_SESSION_KEYS,
  SESSION_STORAGE_KEY,
  loadGalleryStorageState,
  migrateGalleryContext,
  migrateGalleryData,
  migrateGallerySession,
} from '../hooks/useGalleryStorage';
import type { GallerySessionV2 } from '../types';
import { formatTimestamp, migrateTimestamp, timestampToEpoch } from '../utils/common';
import { WORLDLINE_ID_PATTERN } from '../utils/worldline';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  readonly quotaError: boolean;

  constructor(initial: Record<string, string> = {}, quotaError = false) {
    this.values = new Map(Object.entries(initial));
    this.quotaError = quotaError;
  }

  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.quotaError) throw new DOMException('quota', 'QuotaExceededError');
    this.values.set(key, value);
  }
}

const legacyContext = {
  topic: '테스트',
  discussionContext: '',
  worldviewValue: 'NONE',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedModel: 'gemini-3-flash-preview',
  useSearch: false,
};

const legacyGallery = {
  galleryTitle: '테스트 갤러리',
  posts: [
    {
      id: 'p1',
      title: '글',
      author: '작성자',
      timestamp: '26. 08. 14. 오전 05:50',
      content: '내용',
      views: 1,
      recommendations: 0,
      nonRecommendations: 0,
      comments: [
        {
          id: 'c1',
          author: '댓글러',
          text: '댓글',
          timestamp: '08. 14. 오전 05:51',
          recommendations: 0,
          nonRecommendations: 0,
        },
      ],
    },
  ],
};

describe('GallerySessionV2 migration', () => {
  it('atomically migrates legacy keys and removes them only after V2 write', () => {
    const storage = new MemoryStorage({
      galleryData: JSON.stringify(legacyGallery),
      galleryContext: JSON.stringify(legacyContext),
      userProfile: 'null',
    });
    const restored = loadGalleryStorageState(storage);

    expect(restored.galleryData?.posts[0]?.timestamp).toMatch(/^2026-08-1[34]T/);
    expect(timestampToEpoch(restored.galleryData?.posts[0]?.timestamp ?? '')).toBeGreaterThan(0);
    expect(restored.galleryContext?.selectedProvider).toBe('gemini');
    expect(restored.galleryContext?.selectedModel).toBe('gemini-3.5-flash');
    expect(restored.galleryContext?.worldlineId).toMatch(WORLDLINE_ID_PATTERN);
    expect(storage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    for (const key of LEGACY_SESSION_KEYS) expect(storage.getItem(key)).toBeNull();
  });

  it('keeps legacy recovery data if the V2 write fails', () => {
    const storage = new MemoryStorage(
      {
        galleryData: JSON.stringify(legacyGallery),
        galleryContext: JSON.stringify(legacyContext),
      },
      true,
    );
    const restored = loadGalleryStorageState(storage);

    expect(restored.galleryData).not.toBeNull();
    expect(storage.getItem('galleryData')).not.toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('normalizes replies, votes, warnings, and counters while dropping transient grounding data', () => {
    const migrated = migrateGalleryData({
      ...legacyGallery,
      sources: [
        { uri: 'https://example.test/path#first', title: ' 출처 ' },
        { uri: 'https://example.test/path#duplicate' },
        { uri: 'http://example.test/insecure' },
        { uri: 'not a url' },
        null,
      ],
      searchEntryPoint: { renderedContent: '<div>provider-owned markup</div>' },
      warnings: [
        { code: 'DEGRADED', message: '일부 실패', stage: 'comments' },
        { code: '', message: '' },
      ],
      posts: [
        {
          ...legacyGallery.posts[0],
          views: 1.9,
          voted: 'rec',
          isBestPost: true,
          comments: [
            {
              ...legacyGallery.posts[0].comments[0],
              recommendations: 2.8,
              voted: null,
              replyTo: { commentId: ' parent ', author: ' 원댓글 ' },
            },
            { ...legacyGallery.posts[0].comments[0], id: '', text: '' },
          ],
        },
        { ...legacyGallery.posts[0], id: 'bad', views: -1 },
      ],
    });

    expect(migrated?.posts).toHaveLength(1);
    expect(migrated?.posts[0]).toMatchObject({ views: 1, voted: 'rec', isBestPost: true });
    expect(migrated?.posts[0]?.comments[0]).toMatchObject({
      recommendations: 2,
      voted: null,
      replyTo: { commentId: 'parent', author: '원댓글' },
    });
    expect(migrated?.sources).toBeUndefined();
    expect(migrated?.searchEntryPoint).toBeUndefined();
    expect(migrated?.warnings).toHaveLength(1);
  });

  it('rejects malformed galleries and migrates provider context safely', () => {
    expect(migrateGalleryData(null)).toBeNull();
    expect(migrateGalleryData({ galleryTitle: 'g', posts: 'wrong' })).toBeNull();
    expect(migrateGalleryContext(null)).toBeNull();
    expect(migrateGalleryContext({ ...legacyContext, topic: '' })).toBeNull();

    expect(
      migrateGalleryContext({
        ...legacyContext,
        selectedProvider: 'vertex',
        selectedModel: 'gemini-2.5-pro',
      }),
    ).toMatchObject({ selectedProvider: 'vertex', selectedModel: expect.any(String) });

    expect(
      migrateGalleryContext({ ...legacyContext, worldlineId: 'WL-AAAA-BBBB-CCCC' })?.worldlineId,
    ).toBe('WL-AAAA-BBBB-CCCC');
    expect(
      migrateGalleryContext({ ...legacyContext, worldlineId: 'invalid-worldline' })?.worldlineId,
    ).toMatch(WORLDLINE_ID_PATTERN);
  });

  it('migrates a V2-shaped session and defaults invalid metadata', () => {
    const migrated = migrateGallerySession({
      version: 999,
      revision: -1,
      savedAt: 'not-a-date',
      gallery: legacyGallery,
      context: legacyContext,
      profile: { nicknameType: 'FIXED', nickname: '닉', reputation: 20 },
    });

    expect(migrated).toMatchObject({ version: 2, revision: 1 });
    expect(migrated?.profile?.nickname).toBe('닉');
    expect(migrateGallerySession({ gallery: null, context: legacyContext })).toBeNull();
    expect(migrateGallerySession([])).toBeNull();
  });

  it('loads V2 first and tolerates invalid JSON or absent recovery data', () => {
    const session = {
      version: 2,
      revision: 4,
      savedAt: '2026-08-14T00:00:00.000Z',
      gallery: migrateGalleryData(legacyGallery)!,
      context: migrateGalleryContext(legacyContext)!,
      profile: null,
    } satisfies GallerySessionV2;
    const storage = new MemoryStorage({ [SESSION_STORAGE_KEY]: JSON.stringify(session) });
    expect(loadGalleryStorageState(storage).revision).toBe(4);

    const corrupt = new MemoryStorage({
      [SESSION_STORAGE_KEY]: '{broken',
      galleryData: 'null',
      galleryContext: JSON.stringify(legacyContext),
    });
    expect(loadGalleryStorageState(corrupt)).toMatchObject({ galleryData: null, revision: 0 });
  });
});

describe('timestamp migration and presentation', () => {
  it('parses legacy timestamps and uses a deterministic fallback', () => {
    const iso = migrateTimestamp('26. 08. 14. 오전 05:50', Date.UTC(2026, 7, 14));
    expect(timestampToEpoch(iso)).toBeGreaterThan(0);
    expect(formatTimestamp(iso)).not.toBe('날짜 정보 없음');
    const fallback = Date.UTC(2026, 0, 1, 0, 0, 1);
    expect(migrateTimestamp('invalid', fallback)).toBe('2026-01-01T00:00:01.000Z');
  });
});
