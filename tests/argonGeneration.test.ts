import { type GenerateContentParameters, type GoogleGenAI, ThinkingLevel } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluatePost,
  evaluatePostsBatch,
  generateComments,
  generateCommentsBatch,
  generateFeedback,
  generateFollowUpComments,
  MAX_BATCH_COMMENT_OUTPUT_TOKENS,
  MAX_BATCH_EVALUATION_OUTPUT_TOKENS,
  MAX_COMMENT_OUTPUT_TOKENS,
  MAX_EVALUATION_OUTPUT_TOKENS,
  MAX_FEEDBACK_OUTPUT_TOKENS,
  MAX_GALLERY_OUTPUT_TOKENS,
  repairGalleryGeneration,
  streamGalleryGeneration,
} from '../server/ai/generation';
import type { PromptContext } from '../services/prompts/context';

const context: PromptContext = {
  topic: '마법',
  discussionContext: '길드 토론',
  worldviewValue: 'FANTASY',
  worldviewEraValue: 'MEDIEVAL',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '엘프',
  userAffiliation: '길드',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  useSearch: false,
};
const post = { id: 'post-1', title: '마법 연구', author: '글쓴이', content: '새로운 마법' };
const comment = { author: '단골', text: '재미있네', recommendations: 2, nonRecommendations: 0 };
const metrics = {
  suggestedViews: 100,
  suggestedRecommendations: 20,
  suggestedNonRecommendations: 10,
};
const galleryText = JSON.stringify({
  galleryTitle: '마법 갤러리',
  posts: Array.from({ length: 5 }, () => ({ ...post })),
});

const provider = () => {
  const generateContent =
    vi.fn<(parameters: GenerateContentParameters) => Promise<{ text: string }>>();
  const generateContentStream = vi
    .fn<(parameters: GenerateContentParameters) => Promise<AsyncGenerator<{ text: string }>>>()
    .mockImplementation(async () =>
      (async function* () {
        yield { text: galleryText };
      })(),
    );
  return {
    ai: { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI,
    generateContent,
    generateContentStream,
  };
};

describe('Argon generation compatibility', () => {
  it.each(['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'])(
    'uses model-specific settings throughout generation for %s',
    async model => {
      const { ai, generateContent, generateContentStream } = provider();
      const signal = new AbortController().signal;
      generateContent
        .mockResolvedValueOnce({ text: galleryText })
        .mockResolvedValueOnce({ text: JSON.stringify([comment]) })
        .mockResolvedValueOnce({ text: JSON.stringify([comment]) })
        .mockResolvedValueOnce({ text: JSON.stringify([{ postId: post.id, comments: [comment] }]) })
        .mockResolvedValueOnce({ text: JSON.stringify(metrics) })
        .mockResolvedValueOnce({ text: JSON.stringify([{ postId: post.id, ...metrics }]) })
        .mockResolvedValueOnce({ text: '세계관 피드백' });

      const chunks = [];
      for await (const chunk of await streamGalleryGeneration(ai, context, model, signal)) {
        chunks.push(chunk.text);
      }
      expect(chunks.join('')).toBe(galleryText);
      await expect(repairGalleryGeneration(ai, context, model, signal)).resolves.toBe(galleryText);
      await expect(generateComments(ai, post, context, 1, 1, model, signal)).resolves.toEqual([
        comment,
      ]);
      await expect(
        generateFollowUpComments(ai, post, [], 0, context, 1, 1, model, signal),
      ).resolves.toEqual([comment]);
      await expect(
        generateCommentsBatch(ai, [{ ...post, requestedCommentCount: 1 }], context, model, signal),
      ).resolves.toEqual(new Map([[post.id, [comment]]]));
      await expect(evaluatePost(ai, post, context, model, signal)).resolves.toEqual(metrics);
      await expect(evaluatePostsBatch(ai, [post], context, model, signal)).resolves.toEqual(
        new Map([[post.id, metrics]]),
      );
      await expect(
        generateFeedback(ai, '마법 세계관', { galleryTitle: '마법', posts: [] }, model, signal),
      ).resolves.toBe('세계관 피드백');

      expect(generateContentStream).toHaveBeenCalledOnce();
      expect(generateContent).toHaveBeenCalledTimes(7);
      const requests = [
        generateContentStream.mock.calls[0][0],
        ...generateContent.mock.calls.map(([parameters]) => parameters),
      ];
      const legacyBudgets = [
        MAX_GALLERY_OUTPUT_TOKENS,
        MAX_GALLERY_OUTPUT_TOKENS,
        MAX_COMMENT_OUTPUT_TOKENS,
        MAX_COMMENT_OUTPUT_TOKENS,
        MAX_BATCH_COMMENT_OUTPUT_TOKENS,
        MAX_EVALUATION_OUTPUT_TOKENS,
        MAX_BATCH_EVALUATION_OUTPUT_TOKENS,
        MAX_FEEDBACK_OUTPUT_TOKENS,
      ];
      requests.forEach((parameters, index) => {
        expect(parameters.model).toBe(model);
        expect(parameters.config?.abortSignal).toBe(signal);
        expect(parameters.config?.maxOutputTokens).toBe(
          model === 'gemini-4-argon' ? 32_768 : legacyBudgets[index],
        );
        if (model === 'gemini-4-argon') {
          expect(parameters.config?.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.LOW });
        } else {
          expect(parameters.config).not.toHaveProperty('thinkingConfig');
        }
        if (index < requests.length - 1) {
          expect(parameters.config?.responseMimeType).toBe('application/json');
          expect(parameters.config?.responseSchema).toBeDefined();
        }
      });
    },
  );

  it('keeps the Argon budget and thinking level when repairing a structured response', async () => {
    const { ai, generateContent } = provider();
    generateContent
      .mockResolvedValueOnce({ text: '{invalid' })
      .mockResolvedValueOnce({ text: JSON.stringify([comment]) });

    await expect(generateComments(ai, post, context, 1, 1, 'gemini-4-argon')).resolves.toEqual([
      comment,
    ]);

    expect(generateContent).toHaveBeenCalledTimes(2);
    const [initial, repair] = generateContent.mock.calls.map(([parameters]) => parameters);
    expect(repair.contents).toBe(initial.contents);
    expect(repair.config?.responseSchema).toEqual(initial.config?.responseSchema);
    expect(repair.config?.systemInstruction).toContain('FORMAT RECOVERY');
    for (const parameters of [initial, repair]) {
      expect(parameters.config).toMatchObject({
        maxOutputTokens: 32_768,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      });
    }
  });

  it('preserves search tools when streaming with Argon settings', async () => {
    const { ai, generateContentStream } = provider();
    const stream = await streamGalleryGeneration(
      ai,
      { ...context, useSearch: true },
      'gemini-4-argon',
    );
    for await (const chunk of stream) expect(chunk.text).toBe(galleryText);

    expect(generateContentStream.mock.calls[0][0].config).toMatchObject({
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 32_768,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(generateContentStream.mock.calls[0][0].config).not.toHaveProperty('responseSchema');
  });
});
