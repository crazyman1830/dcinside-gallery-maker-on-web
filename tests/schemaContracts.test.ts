import { describe, expect, it } from 'vitest';
import {
  addUserPostRequestSchema,
  commentSchema,
  createGalleryParamsSchema,
  followUpCommentsRequestSchema,
  galleryContextSchema,
  galleryDataSchema,
  gallerySessionV2Schema,
  geminiCommentContentSchema,
  geminiEvaluationResponseSchema,
  geminiResponseDataSchema,
  generationWarningSchema,
  groundingSearchEntryPointSchema,
  groundingSourceSchema,
  initialGalleryDataSchema,
  newPostDataSchema,
  postSchema,
  replyTargetSchema,
  userProfileSchema,
  worldviewFeedbackRequestSchema,
} from '../schemas';

const requestContext = {
  topic: '  주제  ',
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
} as const;

const context = {
  ...requestContext,
  worldlineId: 'WL-1111-2222-3333',
} as const;

const comment = {
  id: 'comment-1',
  author: '댓글러',
  text: '내용',
  timestamp: '2026-08-14T00:00:00.000Z',
  recommendations: 0,
  nonRecommendations: 0,
} as const;

const post = {
  id: 'post-1',
  title: '제목',
  author: '작성자',
  timestamp: '2026-08-14T00:00:00.000Z',
  content: '게시물 내용',
  views: 1,
  recommendations: 0,
  nonRecommendations: 0,
  comments: [comment],
} as const;

const searchEntryPoint = {
  renderedContent: '<style>.chip{}</style><a href="https://www.google.com/search?q=test">test</a>',
} as const;

describe('shared runtime schemas', () => {
  it('normalizes a valid request and rejects unknown API fields', () => {
    expect(createGalleryParamsSchema.parse(requestContext).topic).toBe('주제');
    expect(createGalleryParamsSchema.safeParse(context).success).toBe(false);
    expect(galleryContextSchema.safeParse(context).success).toBe(true);
    expect(galleryContextSchema.safeParse(requestContext).success).toBe(false);
    expect(
      createGalleryParamsSchema.safeParse({ ...requestContext, unexpected: true }).success,
    ).toBe(false);
    expect(newPostDataSchema.safeParse({ title: 't', author: 'a', content: 'c' }).success).toBe(
      true,
    );
    expect(
      addUserPostRequestSchema.safeParse({
        newPostData: { title: 't', author: 'a', content: 'c' },
        galleryContext: requestContext,
      }).success,
    ).toBe(true);
    expect(
      addUserPostRequestSchema.safeParse({
        newPostData: { title: 't', author: 'a', content: 'c' },
        galleryContext: context,
      }).success,
    ).toBe(false);
    expect(
      addUserPostRequestSchema.safeParse({
        newPostData: { title: 't', author: 'a', content: 'c', id: 'client-id' },
        galleryContext: requestContext,
      }).success,
    ).toBe(false);
  });

  it('enforces custom worldview and unique manual age groups', () => {
    expect(
      createGalleryParamsSchema.safeParse({
        ...requestContext,
        worldviewValue: 'CUSTOM',
        customWorldviewText: '',
      }).success,
    ).toBe(false);
    expect(
      createGalleryParamsSchema.safeParse({
        ...requestContext,
        worldviewValue: 'CUSTOM',
        customWorldviewText: '우주 도시',
        genderRatioValue: '100',
        ageRangeValue: ['TWENTIES', 'THIRTIES'],
      }).success,
    ).toBe(true);
    expect(
      createGalleryParamsSchema.safeParse({
        ...requestContext,
        ageRangeValue: ['TWENTIES', 'TWENTIES'],
      }).success,
    ).toBe(false);
    expect(
      createGalleryParamsSchema.safeParse({ ...requestContext, worldviewValue: 'UNKNOWN' }).success,
    ).toBe(false);
  });

  it('checks anonymous profiles and structured reply targets', () => {
    expect(
      userProfileSchema.safeParse({
        nicknameType: 'ANONYMOUS',
        nickname: 'ㅇㅇ',
        ip: '(123.45)',
        reputation: 50,
      }).success,
    ).toBe(true);
    expect(
      userProfileSchema.safeParse({
        nicknameType: 'ANONYMOUS',
        nickname: 'ㅇㅇ',
        ip: '127.0.0.1',
        reputation: 50,
      }).success,
    ).toBe(false);
    expect(
      replyTargetSchema.safeParse({ commentId: 'c1', author: 'a', unexpected: 1 }).success,
    ).toBe(false);
  });

  it('validates persisted posts, comments, and warnings', () => {
    expect(
      commentSchema.safeParse({ ...comment, replyTo: { commentId: 'c0', author: '원글' } }).success,
    ).toBe(true);
    expect(commentSchema.safeParse({ ...comment, recommendations: -1 }).success).toBe(false);
    expect(
      commentSchema.safeParse({
        ...comment,
        timestamp: `2026-08-14T00:00:00.${'1'.repeat(100)}Z`,
      }).success,
    ).toBe(false);
    expect(postSchema.safeParse({ ...post, views: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(
      generationWarningSchema.safeParse({ code: 'DEGRADED', message: '보조 생성 실패' }).success,
    ).toBe(true);
    expect(
      galleryDataSchema.safeParse({ galleryTitle: '갤러리', posts: [post], unknown: true }).success,
    ).toBe(false);
    expect(initialGalleryDataSchema.safeParse({ galleryTitle: 'g', posts: [post] }).success).toBe(
      false,
    );
    expect(
      initialGalleryDataSchema.safeParse({
        galleryTitle: 'g',
        posts: Array.from({ length: 5 }, (_, index) => ({ ...post, id: `p-${index}` })),
      }).success,
    ).toBe(true);
  });

  it('accepts only bounded HTTPS grounding sources', () => {
    expect(
      groundingSourceSchema.parse({ uri: 'https://example.test/path', title: '출처' }).uri,
    ).toBe('https://example.test/path');
    expect(groundingSourceSchema.safeParse({ uri: 'http://example.test' }).success).toBe(false);
    expect(groundingSourceSchema.safeParse({ title: 'URI 없음' }).success).toBe(false);
    expect(groundingSearchEntryPointSchema.parse(searchEntryPoint)).toEqual(searchEntryPoint);
    expect(
      groundingSearchEntryPointSchema.safeParse({ renderedContent: '가'.repeat(22_000) }).success,
    ).toBe(false);
  });

  it('validates endpoint nesting and comment caps', () => {
    expect(
      followUpCommentsRequestSchema.safeParse({
        targetPost: {
          id: post.id,
          title: post.title,
          author: post.author,
          content: post.content,
        },
        recentComments: [comment],
        totalCommentCount: 1,
        galleryContext: requestContext,
      }).success,
    ).toBe(true);
    expect(
      worldviewFeedbackRequestSchema.safeParse({
        customWorldviewText: '설정',
        gallerySample: {
          galleryTitle: '갤러리',
          posts: [],
          sources: [{ uri: 'https://example.test/' }],
          searchEntryPoint,
        },
        selectedModel: 'gemini-3.5-flash',
      }).success,
    ).toBe(false);
    expect(
      followUpCommentsRequestSchema.safeParse({
        targetPost: {
          id: post.id,
          title: post.title,
          author: post.author,
          content: post.content,
        },
        recentComments: Array.from({ length: 7 }, (_, index) => ({
          ...comment,
          id: `c-${index}`,
        })),
        totalCommentCount: 7,
        galleryContext: requestContext,
      }).success,
    ).toBe(false);
    const feedbackRequest = {
      customWorldviewText: '설정',
      gallerySample: {
        galleryTitle: '갤러리',
        posts: [{ title: post.title, content: post.content, comments: [] }],
      },
      selectedModel: 'gemini-3.5-flash',
      selectedProvider: 'gemini',
    } as const;
    expect(worldviewFeedbackRequestSchema.safeParse(feedbackRequest).success).toBe(true);
    expect(
      worldviewFeedbackRequestSchema.safeParse({
        ...feedbackRequest,
        worldlineId: context.worldlineId,
      }).success,
    ).toBe(false);
  });

  it('normalizes provider payloads while enforcing element contracts', () => {
    const generatedPost = { title: 't', author: 'a', content: 'c', ignored: true };
    expect(
      geminiResponseDataSchema.parse({
        galleryTitle: 'g',
        ignored: true,
        posts: Array.from({ length: 5 }, () => generatedPost),
      }),
    ).toEqual({
      galleryTitle: 'g',
      posts: Array.from({ length: 5 }, () => ({ title: 't', author: 'a', content: 'c' })),
    });
    expect(
      geminiResponseDataSchema.safeParse({ galleryTitle: 'g', posts: [generatedPost] }).success,
    ).toBe(false);
    expect(
      geminiCommentContentSchema.parse({
        author: 'a',
        text: 't',
        recommendations: 1,
        ignored: true,
      }),
    ).toEqual({ author: 'a', text: 't', recommendations: 1 });
    expect(
      geminiEvaluationResponseSchema.safeParse({
        suggestedViews: 1.2,
        suggestedRecommendations: 0,
        suggestedNonRecommendations: 0,
      }).success,
    ).toBe(false);
    expect(
      geminiEvaluationResponseSchema.safeParse({
        suggestedViews: 100,
        suggestedRecommendations: 70,
        suggestedNonRecommendations: 40,
      }).success,
    ).toBe(false);
  });

  it('accepts only complete V2 sessions', () => {
    const session = {
      version: 2,
      revision: 3,
      savedAt: '2026-08-14T00:00:00.000Z',
      gallery: { galleryTitle: '갤러리', posts: [post] },
      context,
      profile: null,
    } as const;
    expect(gallerySessionV2Schema.safeParse(session).success).toBe(true);
    expect(gallerySessionV2Schema.safeParse({ ...session, revision: -1 }).success).toBe(false);
    expect(
      gallerySessionV2Schema.safeParse({
        ...session,
        gallery: {
          ...session.gallery,
          sources: [{ uri: 'https://example.test/' }],
          searchEntryPoint,
        },
      }).success,
    ).toBe(false);
  });
});
