import express from 'express';
import request from 'supertest';
import type { GenerateContentParameters, GoogleGenAI } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVALUATION_MODEL_BY_PROVIDER, MAX_TOTAL_COMMENTS_PER_POST } from '../constants';
import {
  evaluatePostsBatch,
  generateCommentsBatch,
  MAX_BATCH_COMMENT_OUTPUT_TOKENS,
  MAX_BATCH_EVALUATION_OUTPUT_TOKENS,
  MAX_COMMENT_OUTPUT_TOKENS,
} from '../server/ai/generation';
import { createGallery, retryPostStage } from '../server/galleryEngine';
import { createGenerationRouter } from '../server/routes/generationRoutes';
import { PROMPT_DATA_PREAMBLE } from '../services/prompts/simulationContext';
import type { Comment, CreateGalleryParams, Post } from '../types';

const context: CreateGalleryParams = {
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
  selectedProvider: 'vertex',
  selectedModel: 'selected-model',
  useSearch: false,
  fixedNicknames: [
    {
      id: 'fixed-1',
      nickname: '단골',
      description: '길드 전문가',
      speechStyle: '짧은 반말',
      activity: 'frequent',
    },
  ],
};
const metrics = {
  suggestedViews: 100,
  suggestedRecommendations: 20,
  suggestedNonRecommendations: 10,
};
const comment = {
  author: '단골',
  text: '구체적인 내용에 대한 답변',
  recommendations: 2,
  nonRecommendations: 0,
};
const storedComment: Comment = {
  ...comment,
  id: 'user-comment',
  timestamp: '2026-10-03T00:00:00.000Z',
  voted: 'rec',
  replyTo: { commentId: 'older-comment', author: '선배' },
  reactionFailure: {
    message: 'LOCAL_FAILURE',
    retryAt: 0,
    reconnect: false,
    retryable: true,
    failedAt: '2026-10-03T00:00:00.000Z',
  },
};
const post: Post = {
  id: 'post-1',
  title: '마법 연구',
  author: '글쓴이',
  content: '내가 쓴 원래 내용',
  timestamp: '2026-10-03T00:00:00.000Z',
  views: 3,
  recommendations: 1,
  nonRecommendations: 0,
  voted: 'rec',
  isBestPost: false,
  comments: [storedComment],
};
const batchPosts = Array.from({ length: 5 }, (_, index) => ({
  id: 'post-' + index,
  title: '제목 ' + index,
  author: '작성자 ' + index,
  content: '본문',
  requestedCommentCount: 2,
}));
const readData = (parameters: GenerateContentParameters) =>
  JSON.parse(String(parameters.contents).split(PROMPT_DATA_PREAMBLE + '\n')[1]) as {
    kind: string;
    payload: {
      simulation: unknown;
      task: { posts: Array<{ postId: string; requestedCommentCount: number }> };
    };
  };
const batchResponse = (parameters: GenerateContentParameters) =>
  readData(parameters).payload.task.posts.map(item =>
    parameters.config?.maxOutputTokens === MAX_BATCH_EVALUATION_OUTPUT_TOKENS
      ? { postId: item.postId, ...metrics }
      : {
          postId: item.postId,
          comments: Array.from({ length: item.requestedCommentCount }, () => ({ ...comment })),
        },
  );
const provider = () => {
  const generateContent = vi.fn(async (parameters: GenerateContentParameters) => ({
    text: JSON.stringify(batchResponse(parameters)),
  }));
  const generateContentStream = vi.fn(async () =>
    (async function* () {
      yield {
        text: JSON.stringify({
          galleryTitle: '마법 갤러리',
          posts: batchPosts.map(({ title, author, content }) => ({ title, author, content })),
        }),
      };
    })(),
  );
  return {
    ai: { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI,
    generateContent,
    generateContentStream,
  };
};
afterEach(() => vi.restoreAllMocks());

describe('batched initial generation', () => {
  it('uses three calls, routes models and supports the maximum 60 comments', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { ai, generateContent, generateContentStream } = provider();
    const result = await createGallery(ai, context, {
      onChunk: () => undefined,
      onPhase: () => undefined,
    });
    expect(generateContentStream).toHaveBeenCalledOnce();
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.warnings).toBeUndefined();
    expect(result.posts).toHaveLength(5);
    expect(result.posts.flatMap(item => item.comments)).toHaveLength(60);
    expect(result.posts.every(item => item.views === 100)).toBe(true);
    expect(result.posts.every(item => item.comments.every(reply => reply.author === '단골'))).toBe(
      true,
    );
    const calls = generateContent.mock.calls.map(([parameters]) => parameters);
    expect(
      calls.find(item => item.config?.maxOutputTokens === MAX_BATCH_EVALUATION_OUTPUT_TOKENS)
        ?.model,
    ).toBe(EVALUATION_MODEL_BY_PROVIDER.vertex);
    expect(
      calls.find(item => item.config?.maxOutputTokens === MAX_BATCH_COMMENT_OUTPUT_TOKENS)?.model,
    ).toBe(context.selectedModel);
    for (const parameters of calls) {
      expect(readData(parameters).payload.simulation).toMatchObject({
        fixedNicknames: [
          {
            nickname: '단골',
            description: '길드 전문가',
            speechStyle: '짧은 반말',
            activity: 'frequent',
          },
        ],
      });
      expect(new Set(readData(parameters).payload.task.posts.map(item => item.postId))).toEqual(
        new Set(result.posts.map(item => item.id)),
      );
    }
  });

  it.each(['duplicate ID', 'missing result', 'metric invariant'] as const)(
    'repairs %s once with unchanged context',
    async defect => {
      const { ai, generateContent } = provider();
      generateContent.mockImplementationOnce(async parameters => {
        const rows = batchResponse(parameters) as Array<{
          postId: string;
          suggestedViews: number;
          suggestedRecommendations: number;
        }>;
        if (defect === 'duplicate ID') rows[1].postId = rows[0].postId;
        if (defect === 'missing result') rows.pop();
        if (defect === 'metric invariant') rows[0].suggestedRecommendations = 101;
        return { text: JSON.stringify(rows) };
      });
      expect((await evaluatePostsBatch(ai, batchPosts, context, 'evaluator')).size).toBe(5);
      expect(generateContent).toHaveBeenCalledTimes(2);
      const [first, second] = generateContent.mock.calls.map(([parameters]) => parameters);
      expect(second.contents).toBe(first.contents);
      expect(second.config?.responseSchema).toBe(first.config?.responseSchema);
      expect(second.config?.systemInstruction).toContain('FORMAT RECOVERY');
    },
  );

  it('repairs incorrect per-post comment counts instead of padding them', async () => {
    const { ai, generateContent } = provider();
    generateContent.mockImplementationOnce(async parameters => {
      const rows = batchResponse(parameters) as Array<{ postId: string; comments: unknown[] }>;
      rows[0].comments.pop();
      return { text: JSON.stringify(rows) };
    });
    const result = await generateCommentsBatch(ai, batchPosts, context, 'comment-model');
    expect([...result.values()].every(comments => comments.length === 2)).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].contents).toBe(
      generateContent.mock.calls[0][0].contents,
    );
  });
});

describe('retry one failed enrichment stage', () => {
  it('retries only evaluation and preserves post content, comments and the local vote', async () => {
    const { ai, generateContent } = provider();
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(metrics) });
    const result = await retryPostStage(ai, post, 'evaluation', context);
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent.mock.calls[0][0].model).toBe(EVALUATION_MODEL_BY_PROVIDER.vertex);
    expect(result).toEqual({
      post: { ...post, views: 100, recommendations: 21, nonRecommendations: 10 },
      warnings: [],
    });
    expect(result.post.comments).toBe(post.comments);
    expect(String(generateContent.mock.calls[0][0].contents)).not.toContain('LOCAL_FAILURE');
  });

  it('retries only comments and replaces only unmodified known legacy placeholders', async () => {
    const legacy: Comment = {
      ...storedComment,
      id: 'comment-fallback-' + post.id + '-uuid',
      author: '자동댓글1',
      text: '그럴 수도 있겠네.',
      recommendations: 0,
      nonRecommendations: 0,
      voted: null,
      replyTo: undefined,
      reactionFailure: undefined,
    };
    const ordinary = { ...legacy, id: 'ordinary-id' };
    const votedLegacy = {
      ...legacy,
      id: 'comment-fallback-' + post.id + '-voted',
      voted: 'rec' as const,
      recommendations: 1,
    };
    const original = { ...post, comments: [legacy, storedComment, ordinary, votedLegacy] };
    const { ai, generateContent } = provider();
    generateContent.mockImplementation(async parameters => {
      const count = Number(
        (parameters.config?.responseSchema as { minItems?: string } | undefined)?.minItems,
      );
      return { text: JSON.stringify(Array.from({ length: count }, () => comment)) };
    });
    const result = await retryPostStage(ai, original, 'comments', context);
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent.mock.calls[0][0].config?.maxOutputTokens).toBe(
      MAX_COMMENT_OUTPUT_TOKENS,
    );
    expect(generateContent.mock.calls[0][0].model).toBe(context.selectedModel);
    expect(result.post).toMatchObject({ ...post, comments: expect.any(Array) });
    expect(result.post.comments.slice(0, 3)).toEqual([storedComment, ordinary, votedLegacy]);
    expect(result.post.comments.some(item => item.id === legacy.id)).toBe(false);
    expect(original.comments).toHaveLength(4);
    expect(result.warnings).toEqual([]);
  });

  it('keeps the original post and reports only the failed stage when recovery fails', async () => {
    const { ai, generateContent } = provider();
    generateContent.mockResolvedValue({ text: '{broken' });
    const result = await retryPostStage(ai, post, 'comments', context);
    expect(result.post).toBe(post);
    expect(result.warnings).toEqual([
      expect.objectContaining({ stage: 'comments', postId: post.id }),
    ]);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(
      generateContent.mock.calls.every(
        ([parameters]) => parameters.config?.maxOutputTokens === MAX_COMMENT_OUTPUT_TOKENS,
      ),
    ).toBe(true);
  });

  it('honors capacity without calling the provider when comments are full', async () => {
    const { ai, generateContent } = provider();
    const full = {
      ...post,
      comments: Array.from({ length: MAX_TOTAL_COMMENTS_PER_POST }, (_, index) => ({
        ...storedComment,
        id: 'user-' + index,
      })),
    };
    const result = await retryPostStage(ai, full, 'comments', context);
    expect(generateContent).not.toHaveBeenCalled();
    expect(result.post).toBe(full);
    expect(result.warnings[0].stage).toBe('comments');
  });

  it('propagates explicit cancellation instead of swallowing it', async () => {
    const { ai, generateContent } = provider();
    const reason = new DOMException('cancelled', 'AbortError');
    await expect(
      retryPostStage(ai, post, 'comments', context, AbortSignal.abort(reason)),
    ).rejects.toBe(reason);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('retry-stage endpoint', () => {
  it('validates the stage and returns the recovered post using the selected provider', async () => {
    const { ai, generateContent } = provider();
    generateContent.mockResolvedValue({ text: JSON.stringify(metrics) });
    const getClient = vi.fn(() => ai);
    const assertModelAllowed = vi.fn();
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.use(
      '/api/ai',
      createGenerationRouter({ getSessionId: () => 'retry-test', getClient, assertModelAllowed }),
    );
    await request(app)
      .post('/api/ai/posts/retry-stage')
      .send({ post, stage: 'all', galleryContext: context })
      .expect(400);
    expect(generateContent).not.toHaveBeenCalled();
    const response = await request(app)
      .post('/api/ai/posts/retry-stage')
      .send({ post, stage: 'evaluation', galleryContext: context })
      .expect(200);
    expect(response.body).toMatchObject({
      post: { id: post.id, recommendations: 21, comments: [storedComment] },
      warnings: [],
    });
    expect(getClient).toHaveBeenCalledWith('retry-test', 'vertex');
    expect(assertModelAllowed).toHaveBeenCalledWith('vertex', context.selectedModel);
  });
});

describe('hidden generation recovery checkpoints', () => {
  it('retains each successful stage before the other stage times out', async () => {
    const { ai, generateContent } = provider();
    const controller = new AbortController();
    const snapshots: import('../types').GalleryData[] = [];
    generateContent.mockImplementation(async parameters => {
      if (parameters.config?.maxOutputTokens === MAX_BATCH_COMMENT_OUTPUT_TOKENS)
        return new Promise(() => undefined);
      return { text: JSON.stringify(batchResponse(parameters)) };
    });
    const reason = Object.assign(new Error('deadline'), { status: 504, code: 'AI_TIMEOUT' });
    const operation = createGallery(
      ai,
      context,
      {
        onChunk: () => undefined,
        onPhase: () => undefined,
        onCheckpoint: data => {
          snapshots.push(data);
        },
      },
      controller.signal,
    );
    const rejection = expect(operation).rejects.toBe(reason);
    await vi.waitFor(() => expect(snapshots).toHaveLength(2));
    expect(snapshots[0].warnings).toHaveLength(10);
    expect(snapshots[0].posts.every(item => item.views === 0)).toBe(true);
    expect(snapshots[1].warnings).toHaveLength(5);
    expect(snapshots[1].warnings?.every(warning => warning.stage === 'comments')).toBe(true);
    expect(snapshots[1].posts.every(item => item.views === 100)).toBe(true);
    controller.abort(reason);
    await rejection;
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry providers or label transport failures as enrichment failures', async () => {
    const { ai, generateContent } = provider();
    const transportError = new Error('checkpoint transport failed');
    let snapshots = 0;
    const onWarning = vi.fn();
    await expect(
      createGallery(ai, context, {
        onChunk: () => undefined,
        onPhase: () => undefined,
        onWarning,
        onCheckpoint: () => {
          if (++snapshots > 1) throw transportError;
        },
      }),
    ).rejects.toBe(transportError);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(onWarning).not.toHaveBeenCalled();
  });
});
