import { randomUUID } from 'node:crypto';
import type { GoogleGenAI } from '@google/genai';
import type {
  Comment,
  CreateGalleryParams,
  GalleryData,
  GroundingSource,
  NewPostData,
  Post,
} from '../types';
import type { PromptContext } from '../services/prompts/context';
import {
  EVALUATION_MODEL_BY_PROVIDER,
  MAX_AI_FOLLOW_UP_COMMENTS,
  MAX_COMMENTS_PER_BEST_POST,
  MAX_COMMENTS_PER_POST,
  MIN_AI_FOLLOW_UP_COMMENTS,
  MIN_COMMENTS_PER_BEST_POST,
  MIN_COMMENTS_PER_POST,
  NUMBER_OF_POSTS,
  POST_AUTHOR_PREFIX,
} from '../constants';
import { getCurrentTimestamp, getDetailedTimestamp } from '../utils/common';
import { parseGeminiResponse } from '../utils/jsonParser';
import {
  evaluatePost,
  generateComments,
  generateFeedback,
  generateFollowUpComments,
  streamGalleryGeneration,
} from './ai/generation';

type Phase = 'gallery' | 'posts' | 'complete';

export interface GenerationCallbacks {
  onChunk: (text: string) => void;
  onPhase: (phase: Phase, message: string) => void;
}

const makeId = (prefix: string): string => `${prefix}-${randomUUID()}`;

const ensureUniqueCommentAuthor = (
  currentAuthor: string,
  postAuthor: string,
  fallbackIndex: number,
): string => {
  const candidate = currentAuthor || `익명${fallbackIndex + 1}`;
  return candidate === postAuthor ? `${POST_AUTHOR_PREFIX}${candidate}` : candidate;
};

const toPromptContext = (params: CreateGalleryParams): PromptContext => ({
  topic: params.topic,
  discussionContext: params.discussionContext,
  worldviewValue: params.worldviewValue,
  customWorldviewText: params.customWorldviewText,
  worldviewEraValue: params.worldviewEraValue,
  toxicityLevelValue: params.toxicityLevelValue,
  anonymousNickRatioValue: params.anonymousNickRatioValue,
  userSpecies: params.userSpecies,
  userAffiliation: params.userAffiliation,
  genderRatioValue: params.genderRatioValue,
  ageRangeValue: params.ageRangeValue,
  useSearch: params.useSearch,
  userProfile: params.userProfile,
});

const toComments = (
  generated: Awaited<ReturnType<typeof generateComments>>,
  postId: string,
  postAuthor: string,
  isBest: boolean,
): Comment[] => generated.map((comment, index) => ({
  id: makeId(`comment-${postId}`),
  author: ensureUniqueCommentAuthor(comment.author, postAuthor, index),
  text: comment.text || '...',
  timestamp: getCurrentTimestamp(),
  recommendations: comment.recommendations ?? Math.floor(Math.random() * (isBest ? 50 : 15)),
  nonRecommendations: comment.nonRecommendations ?? Math.floor(Math.random() * 5),
}));

export const createGallery = async (
  ai: GoogleGenAI,
  params: CreateGalleryParams,
  callbacks: GenerationCallbacks,
  signal?: AbortSignal,
): Promise<GalleryData> => {
  const context = toPromptContext(params);
  callbacks.onPhase('gallery', '갤러리 게시물을 생성하고 있습니다.');
  const stream = await streamGalleryGeneration(ai, context, params.selectedModel, signal);
  const sources: GroundingSource[] = [];
  let responseText = '';

  for await (const chunk of stream) {
    responseText += chunk.text;
    if (chunk.text) callbacks.onChunk(chunk.text);
    sources.push(...chunk.sources);
  }

  const generatedGallery = parseGeminiResponse(responseText);
  if (!Array.isArray(generatedGallery.posts) || generatedGallery.posts.length === 0) {
    throw new Error('AI가 게시물 목록을 반환하지 않았습니다.');
  }

  callbacks.onPhase('posts', '게시물 반응과 댓글을 생성하고 있습니다.');
  const posts: Post[] = [];
  const evaluationModel = EVALUATION_MODEL_BY_PROVIDER[params.selectedProvider];

  for (const [postIndex, generatedPost] of generatedGallery.posts
    .slice(0, NUMBER_OF_POSTS)
    .entries()) {
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    const isBest = postIndex === 0;
    const postId = makeId('post');
    const postAuthor = generatedPost.author || `익명_${postIndex + 1}`;
    const minComments = isBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
    const maxComments = isBest ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;

    const [metrics, generatedComments] = await Promise.all([
      evaluatePost(ai, generatedPost, context, evaluationModel, signal),
      generateComments(
        ai,
        generatedPost,
        context,
        minComments,
        maxComments,
        params.selectedModel,
        signal,
      ),
    ]);
    const comments = toComments(generatedComments, postId, postAuthor, isBest);
    while (comments.length < minComments) {
      comments.push({
        id: makeId(`comment-fallback-${postId}`),
        author: `자동댓글${comments.length + 1}`,
        text: isBest ? '이 글은 좀 개념글 감이다.' : '그럴 수도 있겠네.',
        timestamp: getCurrentTimestamp(),
        recommendations: 0,
        nonRecommendations: 0,
      });
    }

    posts.push({
      id: postId,
      isBestPost: isBest,
      title: generatedPost.title || `${params.topic} 게시물 #${postIndex + 1}`,
      author: postAuthor,
      timestamp: getDetailedTimestamp(
        Math.random() * 60 * 60 * 1_000 * (postIndex + 1),
      ),
      content: generatedPost.content || '게시물 내용이 없습니다.',
      views: metrics.suggestedViews,
      recommendations: metrics.suggestedRecommendations,
      nonRecommendations: metrics.suggestedNonRecommendations,
      comments,
    });

    if (postIndex < Math.min(NUMBER_OF_POSTS, generatedGallery.posts.length) - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  posts.sort((left, right) => (
    new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  ));
  const uniqueSources = sources.filter((source, index, all) => (
    Boolean(source.uri) && all.findIndex(candidate => candidate.uri === source.uri) === index
  ));
  callbacks.onPhase('complete', '갤러리 생성이 완료됐습니다.');
  return {
    galleryTitle: generatedGallery.galleryTitle,
    posts,
    sources: uniqueSources,
  };
};

export const createUserPost = async (
  ai: GoogleGenAI,
  newPostData: NewPostData,
  contextParams: CreateGalleryParams,
  signal?: AbortSignal,
): Promise<Post> => {
  const context = toPromptContext(contextParams);
  const metrics = await evaluatePost(
    ai,
    newPostData,
    context,
    EVALUATION_MODEL_BY_PROVIDER[contextParams.selectedProvider],
    signal,
  );
  const isBest = metrics.suggestedRecommendations >= 50;
  const minComments = isBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
  const maxComments = isBest ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;
  const generatedComments = await generateComments(
    ai,
    newPostData,
    context,
    minComments,
    maxComments,
    contextParams.selectedModel,
    signal,
  );
  const postId = makeId('user-post');
  return {
    id: postId,
    ...newPostData,
    timestamp: getDetailedTimestamp(),
    views: metrics.suggestedViews,
    recommendations: metrics.suggestedRecommendations,
    nonRecommendations: metrics.suggestedNonRecommendations,
    isBestPost: isBest,
    comments: toComments(generatedComments, postId, newPostData.author, isBest),
  };
};

export const createFollowUpComments = async (
  ai: GoogleGenAI,
  targetPost: Post,
  updatedComments: Comment[],
  contextParams: CreateGalleryParams,
  signal?: AbortSignal,
): Promise<Comment[]> => {
  const generated = await generateFollowUpComments(
    ai,
    targetPost,
    updatedComments,
    toPromptContext(contextParams),
    MIN_AI_FOLLOW_UP_COMMENTS,
    MAX_AI_FOLLOW_UP_COMMENTS,
    contextParams.selectedModel,
    signal,
  );
  const basePostAuthor = targetPost.author.startsWith(POST_AUTHOR_PREFIX)
    ? targetPost.author.slice(POST_AUTHOR_PREFIX.length)
    : targetPost.author;
  return generated.map((comment, index) => ({
    id: makeId(`ai-followup-${targetPost.id}-${index}`),
    author: comment.author === basePostAuthor
      ? `${POST_AUTHOR_PREFIX}${comment.author}`
      : comment.author,
    text: comment.text,
    timestamp: getCurrentTimestamp(),
    recommendations: comment.recommendations ?? Math.floor(Math.random() * 10),
    nonRecommendations: comment.nonRecommendations ?? Math.floor(Math.random() * 3),
  }));
};

export const createWorldviewFeedback = generateFeedback;
