import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { CreateGalleryParams, NewPostData, Post } from '../types';
import {
  createFollowUpComments,
  createGallery,
  createUserPost,
  InvalidGroundingSearchEntryPointError,
  sanitizeGroundingSources,
  validateGroundingSearchEntryPoint,
} from '../server/galleryEngine';
import {
  MAX_COMMENT_OUTPUT_TOKENS,
  MAX_EVALUATION_OUTPUT_TOKENS,
  MAX_GALLERY_OUTPUT_TOKENS,
  generateComments,
  evaluatePost,
} from '../server/ai/generation';
import { AiTimeoutError, ClientAbortError } from '../server/http';

const VALID_SEARCH_ENTRY_POINT =
  '<style>.chip{color:#111}</style><div class="container"><a class="chip" href="https://vertexaisearch.cloud.google.com/grounding-api-redirect/test-token">suggestion</a></div>';

const context: CreateGalleryParams = {
  topic: 'topic',
  discussionContext: '',
  worldviewValue: 'NONE',
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

const post = (comments: Post['comments'] = []): Post => ({
  id: 'post-1',
  title: 'title',
  author: 'author',
  content: 'content',
  timestamp: '2026-08-14T00:00:00.000Z',
  views: 0,
  recommendations: 0,
  nonRecommendations: 0,
  comments,
});

describe('gallery engine hardening', () => {
  it('repairs malformed structured responses exactly once', async () => {
    const evaluation = {
      suggestedViews: 10,
      suggestedRecommendations: 2,
      suggestedNonRecommendations: 1,
    };
    const evaluationGenerate = vi
      .fn()
      .mockResolvedValueOnce({ text: '{broken' })
      .mockResolvedValueOnce({ text: JSON.stringify(evaluation) });
    const evaluationClient = {
      models: {
        generateContent: evaluationGenerate,
      },
    } as unknown as GoogleGenAI;
    await expect(
      evaluatePost(
        evaluationClient,
        post(),
        {
          topic: context.topic,
          discussionContext: context.discussionContext,
          worldviewValue: context.worldviewValue,
          worldviewEraValue: context.worldviewEraValue,
          toxicityLevelValue: context.toxicityLevelValue,
          anonymousNickRatioValue: context.anonymousNickRatioValue,
          userSpecies: context.userSpecies,
          userAffiliation: context.userAffiliation,
          genderRatioValue: context.genderRatioValue,
          ageRangeValue: context.ageRangeValue,
        },
        'model',
      ),
    ).resolves.toEqual(evaluation);
    expect(evaluationGenerate).toHaveBeenCalledTimes(2);
    expect(String(evaluationGenerate.mock.calls[1]?.[0]?.contents)).toContain('FORMAT REPAIR');

    const commentsGenerate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'not json' })
      .mockResolvedValueOnce({ text: JSON.stringify([{ author: 'a', text: 'b' }]) });
    const commentsClient = {
      models: {
        generateContent: commentsGenerate,
      },
    } as unknown as GoogleGenAI;
    await expect(
      generateComments(
        commentsClient,
        post(),
        {
          topic: context.topic,
          discussionContext: context.discussionContext,
          worldviewValue: context.worldviewValue,
          worldviewEraValue: context.worldviewEraValue,
          toxicityLevelValue: context.toxicityLevelValue,
          anonymousNickRatioValue: context.anonymousNickRatioValue,
          userSpecies: context.userSpecies,
          userAffiliation: context.userAffiliation,
          genderRatioValue: context.genderRatioValue,
          ageRangeValue: context.ageRangeValue,
        },
        1,
        1,
        'model',
      ),
    ).resolves.toHaveLength(1);
    expect(commentsGenerate).toHaveBeenCalledTimes(2);
  });

  it('keeps only normalized HTTPS grounding sources and caps their count', () => {
    const input = [
      { title: ' safe ', uri: 'https://example.com/path#fragment' },
      { title: 'duplicate', uri: 'https://example.com/path' },
      { uri: 'javascript:alert(1)' },
      { uri: 'http://example.com/' },
      ...Array.from({ length: 25 }, (_, index) => ({ uri: `https://source-${index}.example/` })),
    ];
    const result = sanitizeGroundingSources(input);

    expect(result.sources).toHaveLength(20);
    expect(result.sources[0]).toEqual({ title: 'safe', uri: 'https://example.com/path' });
    expect(result.sources.every(source => source.uri?.startsWith('https://'))).toBe(true);
    expect(result.dropped).toBeGreaterThan(0);
  });

  it('accepts valid Search Suggestions and rejects unsafe or oversized markup', () => {
    expect(validateGroundingSearchEntryPoint(VALID_SEARCH_ENTRY_POINT)).toEqual({
      renderedContent: VALID_SEARCH_ENTRY_POINT,
    });
    for (const renderedContent of [
      '',
      '<style>.chip{}</style><script>alert(1)</script><a href="https://www.google.com/search?q=x">x</a>',
      '<style>.chip{}</style><form><a href="https://www.google.com/search?q=x">x</a></form>',
      '<style>.chip{}</style><a onfocus="alert(1)" href="https://www.google.com/search?q=x">x</a>',
      '<style>.chip{background:url(https://evil.test/x)}</style><a href="https://www.google.com/search?q=x">x</a>',
      '<style>.chip{}</style><a href="https://evil.test/search?q=x">x</a>',
      `<style>${'a'.repeat(64 * 1_024)}</style><a href="https://www.google.com/search?q=x">x</a>`,
    ]) {
      expect(() => validateGroundingSearchEntryPoint(renderedContent)).toThrow(
        InvalidGroundingSearchEntryPointError,
      );
    }
  });

  it('requires valid Search Suggestions whenever Google Search metadata is present', async () => {
    const galleryPayload = {
      galleryTitle: 'gallery',
      posts: [{ title: 'title', author: 'author', content: 'content' }],
    };
    const generateContent = vi.fn();
    const generateContentStream = vi.fn(async () =>
      (async function* () {
        yield {
          text: JSON.stringify(galleryPayload),
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [{ web: { title: 'source', uri: 'https://example.test/' } }],
              },
            },
          ],
        };
      })(),
    );
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;

    await expect(
      createGallery(
        ai,
        { ...context, useSearch: true },
        {
          onChunk: () => undefined,
          onPhase: () => undefined,
        },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_GROUNDING_SEARCH_ENTRY_POINT',
      status: 502,
      retryable: false,
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('combines late Search Suggestions with HTTPS sources and preserves them exactly', async () => {
    const galleryPayload = {
      galleryTitle: 'gallery',
      posts: [{ title: 'title', author: 'author', content: 'content' }],
    };
    const generateContent = vi.fn(async (request: { config?: { maxOutputTokens?: number } }) => {
      if (request.config?.maxOutputTokens === MAX_EVALUATION_OUTPUT_TOKENS) {
        return {
          text: JSON.stringify({
            suggestedViews: 10,
            suggestedRecommendations: 2,
            suggestedNonRecommendations: 1,
          }),
        };
      }
      return {
        text: JSON.stringify([
          { author: 'reply', text: 'comment', recommendations: 0, nonRecommendations: 0 },
        ]),
      };
    });
    const generateContentStream = vi.fn(async () =>
      (async function* () {
        yield {
          text: JSON.stringify(galleryPayload),
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [{ web: { title: 'source', uri: 'https://example.test/' } }],
              },
            },
          ],
        };
        yield {
          text: '',
          candidates: [
            {
              groundingMetadata: {
                webSearchQueries: ['query'],
                searchEntryPoint: { renderedContent: VALID_SEARCH_ENTRY_POINT },
              },
            },
          ],
        };
      })(),
    );
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;

    const result = await createGallery(
      ai,
      { ...context, useSearch: true },
      {
        onChunk: () => undefined,
        onPhase: () => undefined,
      },
    );

    expect(result.sources).toEqual([{ title: 'source', uri: 'https://example.test/' }]);
    expect(result.searchEntryPoint).toEqual({ renderedContent: VALID_SEARCH_ENTRY_POINT });
  });

  it('never generates follow-ups beyond the total comment cap', async () => {
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const ai = { models: { generateContent } } as unknown as GoogleGenAI;
    const comments = Array.from({ length: 30 }, (_, index) => ({
      id: `comment-${index}`,
      author: 'author',
      text: 'comment',
      timestamp: '2026-08-14T00:00:00.000Z',
      recommendations: 0,
      nonRecommendations: 0,
    }));

    await expect(createFollowUpComments(ai, post(comments), comments, context)).resolves.toEqual(
      [],
    );
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('protects the server-generated post ID and applies output token caps', async () => {
    const configs: Array<Record<string, unknown>> = [];
    const generateContent = vi.fn(async (request: { config?: Record<string, unknown> }) => {
      configs.push(request.config ?? {});
      if (configs.length === 1) {
        return {
          text: JSON.stringify({
            suggestedViews: 10,
            suggestedRecommendations: 2,
            suggestedNonRecommendations: 1,
          }),
        };
      }
      return {
        text: JSON.stringify([
          { author: 'reply', text: 'comment', recommendations: 0, nonRecommendations: 0 },
        ]),
      };
    });
    const ai = { models: { generateContent } } as unknown as GoogleGenAI;
    const hostile = {
      title: 'title',
      author: 'author',
      content: 'content',
      id: 'client-id',
    } as NewPostData;

    const result = await createUserPost(ai, hostile, context);

    expect(result.post.id).not.toBe('client-id');
    expect(result.post.id).toMatch(/^user-post-/);
    expect(result.post.comments.length).toBeGreaterThanOrEqual(5);
    expect(result.warnings).toEqual([]);
    expect(configs[0].maxOutputTokens).toBe(MAX_EVALUATION_OUTPUT_TOKENS);
    expect(configs[1].maxOutputTokens).toBe(MAX_COMMENT_OUTPUT_TOKENS);
  });

  it('preserves a user post when both non-fatal enrichment responses stay malformed', async () => {
    const generateContent = vi.fn(async (request: { config?: { maxOutputTokens?: number } }) => {
      if (request.config?.maxOutputTokens === MAX_EVALUATION_OUTPUT_TOKENS) {
        return { text: '{}' };
      }
      return { text: 'not-json' };
    });
    const ai = { models: { generateContent } } as unknown as GoogleGenAI;

    const result = await createUserPost(
      ai,
      {
        title: 'title',
        author: 'author',
        content: 'content',
      },
      context,
    );

    expect(result.post.id).toMatch(/^user-post-/);
    expect(result.post).toMatchObject({
      views: 0,
      recommendations: 0,
      nonRecommendations: 0,
      comments: [],
    });
    expect(result.warnings.map(warning => warning.code)).toEqual([
      'POST_EVALUATION_FALLBACK',
      'POST_COMMENTS_FALLBACK',
    ]);
    expect(result.warnings.every(warning => warning.postId === result.post.id)).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(4);
  });

  it('never converts request cancellation into a user-post fallback', async () => {
    for (const reason of [new AiTimeoutError(), new ClientAbortError()]) {
      const controller = new AbortController();
      controller.abort(reason);
      const generateContent = vi.fn();
      const ai = { models: { generateContent } } as unknown as GoogleGenAI;

      await expect(
        createUserPost(
          ai,
          {
            title: 'title',
            author: 'author',
            content: 'content',
          },
          context,
          controller.signal,
        ),
      ).rejects.toBe(reason);
      expect(generateContent).not.toHaveBeenCalled();
    }
  });

  it('repairs a malformed initial gallery response once before enriching posts', async () => {
    const repairedGallery = {
      galleryTitle: 'repaired gallery',
      posts: [{ title: 'title', author: 'author', content: 'content' }],
    };
    const generateContent = vi.fn(
      async (request: { contents?: unknown; config?: { maxOutputTokens?: number } }) => {
        if (request.config?.maxOutputTokens === MAX_GALLERY_OUTPUT_TOKENS) {
          return { text: JSON.stringify(repairedGallery) };
        }
        if (request.config?.maxOutputTokens === MAX_EVALUATION_OUTPUT_TOKENS) {
          return {
            text: JSON.stringify({
              suggestedViews: 10,
              suggestedRecommendations: 2,
              suggestedNonRecommendations: 1,
            }),
          };
        }
        return {
          text: JSON.stringify([
            { author: 'reply', text: 'comment', recommendations: 0, nonRecommendations: 0 },
          ]),
        };
      },
    );
    const generateContentStream = vi.fn(async () =>
      (async function* () {
        yield { text: '{broken', candidates: [] };
      })(),
    );
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;

    const result = await createGallery(ai, context, {
      onChunk: () => undefined,
      onPhase: () => undefined,
    });

    expect(result.galleryTitle).toBe('repaired gallery');
    expect(result.posts).toHaveLength(1);
    const repairCalls = generateContent.mock.calls.filter(
      call => call[0].config?.maxOutputTokens === MAX_GALLERY_OUTPUT_TOKENS,
    );
    expect(repairCalls).toHaveLength(1);
    expect(String(repairCalls[0]?.[0].contents)).toContain('FORMAT REPAIR');
  });

  it('does not wait for an abort-ignoring sibling after a fatal enrichment failure', async () => {
    const authError = Object.assign(new Error('unauthorized'), { status: 401 });
    let commentsSignal: AbortSignal | undefined;
    const generateContent = vi.fn(
      (request: { config?: { maxOutputTokens?: number; abortSignal?: AbortSignal } }) => {
        if (request.config?.maxOutputTokens === MAX_EVALUATION_OUTPUT_TOKENS) {
          return Promise.reject(authError);
        }
        commentsSignal = request.config?.abortSignal;
        return new Promise<never>(() => undefined);
      },
    );
    const galleryPayload = {
      galleryTitle: 'gallery',
      posts: [{ title: 'title', author: 'author', content: 'content' }],
    };
    const generateContentStream = vi.fn(async () =>
      (async function* () {
        yield { text: JSON.stringify(galleryPayload), candidates: [] };
      })(),
    );
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>(resolve => {
      timeout = setTimeout(() => resolve('timeout'), 250);
    });

    const outcome = await Promise.race([
      createGallery(ai, context, {
        onChunk: () => undefined,
        onPhase: () => undefined,
      }).then(
        () => 'resolved' as const,
        error => error as unknown,
      ),
      timedOut,
    ]);
    if (timeout) clearTimeout(timeout);

    expect(outcome).toBe(authError);
    expect(commentsSignal?.aborted).toBe(true);
  });

  it('opens the enrichment circuit after a persistent provider outage', async () => {
    const outage = Object.assign(new Error('provider unavailable'), {
      status: 503,
      retryAfter: 0,
    });
    const generateContent = vi.fn().mockRejectedValue(outage);
    const galleryPayload = {
      galleryTitle: 'gallery',
      posts: Array.from({ length: 5 }, (_, index) => ({
        title: `title-${index}`,
        author: `author-${index}`,
        content: `content-${index}`,
      })),
    };
    const generateContentStream = vi.fn(async () =>
      (async function* () {
        yield { text: JSON.stringify(galleryPayload), candidates: [] };
      })(),
    );
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;
    const warnings: string[] = [];

    const result = await createGallery(ai, context, {
      onChunk: () => undefined,
      onPhase: () => undefined,
      onWarning: warning => {
        warnings.push(warning.code);
      },
    });

    // The first evaluation and comment call each use the normal three attempts.
    // Remaining posts degrade locally instead of multiplying a known outage.
    expect(generateContent).toHaveBeenCalledTimes(6);
    expect(result.posts).toHaveLength(5);
    expect(warnings.filter(code => code === 'POST_EVALUATION_FALLBACK')).toHaveLength(5);
    expect(warnings.filter(code => code === 'POST_COMMENTS_FALLBACK')).toHaveLength(5);
  });

  it('keeps the healthy enrichment lane running when only comments are unavailable', async () => {
    const outage = Object.assign(new Error('comments provider unavailable'), {
      status: 503,
      retryAfter: 0,
    });
    const generateContent = vi.fn(async (request: { config?: { maxOutputTokens?: number } }) => {
      if (request.config?.maxOutputTokens === MAX_EVALUATION_OUTPUT_TOKENS) {
        return {
          text: JSON.stringify({
            suggestedViews: 10,
            suggestedRecommendations: 2,
            suggestedNonRecommendations: 1,
          }),
        };
      }
      if (request.config?.maxOutputTokens === MAX_COMMENT_OUTPUT_TOKENS) throw outage;
      throw new Error('unexpected provider call');
    });
    const galleryPayload = {
      galleryTitle: 'gallery',
      posts: Array.from({ length: 5 }, (_, index) => ({
        title: `title-${index}`,
        author: `author-${index}`,
        content: `content-${index}`,
      })),
    };
    const generateContentStream = vi.fn(async () =>
      (async function* () {
        yield { text: JSON.stringify(galleryPayload), candidates: [] };
      })(),
    );
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;
    const warnings: string[] = [];

    const result = await createGallery(ai, context, {
      onChunk: () => undefined,
      onPhase: () => undefined,
      onWarning: warning => {
        warnings.push(warning.code);
      },
    });
    const evaluationCalls = generateContent.mock.calls.filter(
      call => call[0].config?.maxOutputTokens === MAX_EVALUATION_OUTPUT_TOKENS,
    );
    const commentCalls = generateContent.mock.calls.filter(
      call => call[0].config?.maxOutputTokens === MAX_COMMENT_OUTPUT_TOKENS,
    );

    expect(evaluationCalls).toHaveLength(5);
    expect(commentCalls).toHaveLength(3);
    expect(result.posts.every(candidate => candidate.views === 10)).toBe(true);
    expect(warnings).not.toContain('POST_EVALUATION_FALLBACK');
    expect(warnings.filter(code => code === 'POST_COMMENTS_FALLBACK')).toHaveLength(5);
  });

  it('degrades non-fatal post enrichment failures and emits warnings', async () => {
    const generateContent = vi.fn(
      async (request: { contents?: unknown; config?: Record<string, unknown> }) => {
        const prompt = String(request.contents ?? '');
        if (prompt.includes('EVALUATION LOGIC')) {
          if (prompt.includes('title-0')) return { text: '{}' };
          return {
            text: JSON.stringify({
              suggestedViews: 10,
              suggestedRecommendations: 2,
              suggestedNonRecommendations: 1,
            }),
          };
        }
        return {
          text: JSON.stringify([
            { author: 'reply', text: 'comment', recommendations: 0, nonRecommendations: 0 },
          ]),
        };
      },
    );
    const galleryPayload = {
      galleryTitle: 'gallery',
      posts: Array.from({ length: 5 }, (_, index) => ({
        title: `title-${index}`,
        author: `author-${index}`,
        content: `content-${index}`,
      })),
    };
    let streamConfig: Record<string, unknown> | undefined;
    const generateContentStream = vi.fn(async (request: { config?: Record<string, unknown> }) => {
      streamConfig = request.config;
      return (async function* () {
        yield {
          text: JSON.stringify(galleryPayload),
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [{ web: { title: 'unsafe', uri: 'javascript:alert(1)' } }],
                searchEntryPoint: { renderedContent: VALID_SEARCH_ENTRY_POINT },
              },
            },
          ],
        };
      })();
    });
    const ai = { models: { generateContent, generateContentStream } } as unknown as GoogleGenAI;
    const warnings: string[] = [];

    const result = await createGallery(ai, context, {
      onChunk: () => undefined,
      onPhase: () => undefined,
      onWarning: warning => {
        warnings.push(warning.code);
      },
    });

    expect(result.posts).toHaveLength(5);
    expect(result.posts.some(candidate => candidate.views === 0)).toBe(true);
    expect(result.posts.filter(candidate => candidate.views === 10)).toHaveLength(4);
    expect(
      result.posts.some(candidate => candidate.views === 0 && candidate.comments.length > 0),
    ).toBe(true);
    expect(warnings).toContain('POST_EVALUATION_FALLBACK');
    expect(warnings).toContain('GROUNDING_SOURCES_FILTERED');
    expect(result.sources).toEqual([]);
    expect(result.searchEntryPoint).toEqual({ renderedContent: VALID_SEARCH_ENTRY_POINT });
    expect(streamConfig?.maxOutputTokens).toBe(MAX_GALLERY_OUTPUT_TOKENS);
  });
});
