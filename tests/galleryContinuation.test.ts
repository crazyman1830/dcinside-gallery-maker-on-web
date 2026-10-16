import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { CreateGalleryRequest } from '../types';
import { createGallery } from '../server/galleryEngine';
import {
  evaluatePostsBatch,
  generateCommentsBatch,
  repairGalleryGeneration,
  streamGalleryGeneration,
} from '../server/ai/generation';

vi.mock('../server/ai/generation', async importOriginal => ({
  ...(await importOriginal<typeof import('../server/ai/generation')>()),
  evaluatePostsBatch: vi.fn(),
  generateCommentsBatch: vi.fn(),
  repairGalleryGeneration: vi.fn(),
  streamGalleryGeneration: vi.fn(),
}));

const request: CreateGalleryRequest = {
  topic: '마법',
  discussionContext: '길드 소식',
  worldviewValue: 'FANTASY',
  worldviewEraValue: 'MEDIEVAL',
  toxicityLevelValue: 'MILD',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel: 'gemini-3.5-flash',
  useSearch: false,
  continuityNotes: '길드장은 루나',
  continuationContext: {
    galleryTitle: '마법 갤러리',
    totalPostCount: 1,
    recentPosts: [{ title: '어제 소식', author: '관찰자', contentExcerpt: '길드 문을 닫았다.' }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('continuation context routing', () => {
  it.each([false, true])(
    'keeps continuation evidence in gallery generation and repair only (repair: %s)',
    async needsRepair => {
      const responseText = JSON.stringify({
        galleryTitle: '마법 갤러리',
        posts: Array.from({ length: 5 }, (_, index) => ({
          title: `새 소식 ${index}`,
          author: `유저${index}`,
          content: '다음날 길드 문을 다시 열었다.',
        })),
      });
      vi.mocked(streamGalleryGeneration).mockResolvedValueOnce(
        (async function* () {
          yield {
            text: needsRepair ? '{broken' : responseText,
            sources: [],
            hasSearchMetadata: false,
          };
        })(),
      );
      vi.mocked(repairGalleryGeneration).mockResolvedValueOnce(responseText);
      vi.mocked(evaluatePostsBatch).mockImplementation(
        async (_ai, posts) =>
          new Map(
            posts.map(post => [
              post.id,
              {
                suggestedViews: 100,
                suggestedRecommendations: 2,
                suggestedNonRecommendations: 0,
              },
            ]),
          ),
      );
      vi.mocked(generateCommentsBatch).mockImplementation(
        async (_ai, posts) =>
          new Map(
            posts.map(post => [
              post.id,
              Array.from({ length: post.requestedCommentCount }, (_, index) => ({
                author: `댓글러${index}`,
                text: '새 소식 확인했다.',
                recommendations: 0,
                nonRecommendations: 0,
              })),
            ]),
          ),
      );
      const result = await createGallery({} as GoogleGenAI, request, {
        onChunk: () => undefined,
        onPhase: () => undefined,
      });
      expect(result.posts).toHaveLength(5);
      expect(vi.mocked(streamGalleryGeneration).mock.calls[0][1]).toMatchObject({
        continuityNotes: request.continuityNotes,
        continuationContext: request.continuationContext,
      });
      if (needsRepair) {
        expect(vi.mocked(repairGalleryGeneration).mock.calls[0][1]).toMatchObject({
          continuityNotes: request.continuityNotes,
          continuationContext: request.continuationContext,
        });
      } else {
        expect(repairGalleryGeneration).not.toHaveBeenCalled();
      }
      expect(evaluatePostsBatch).toHaveBeenCalledTimes(1);
      expect(generateCommentsBatch).toHaveBeenCalledTimes(1);
      for (const calls of [
        vi.mocked(evaluatePostsBatch).mock.calls,
        vi.mocked(generateCommentsBatch).mock.calls,
      ]) {
        for (const call of calls) {
          expect(call[2].continuityNotes).toBe(request.continuityNotes);
          expect(call[2]).not.toHaveProperty('continuationContext');
        }
      }
    },
  );
});
