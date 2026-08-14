import { randomUUID } from 'node:crypto';
import type { GoogleGenAI } from '@google/genai';
import type {
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  GalleryData,
  GenerationWarning,
  GroundingSearchEntryPoint,
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
  MAX_TOTAL_COMMENTS_PER_POST,
  MIN_AI_FOLLOW_UP_COMMENTS,
  MIN_COMMENTS_PER_BEST_POST,
  MIN_COMMENTS_PER_POST,
  NUMBER_OF_POSTS,
  POST_AUTHOR_PREFIX,
} from '../constants';
import { MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES } from '../schemas';
import { getCurrentTimestamp, getDetailedTimestamp, timestampToEpoch } from '../utils/common';
import { parseGeminiResponse } from '../utils/jsonParser';
import {
  evaluatePost,
  generateComments,
  generateFeedback,
  generateFollowUpComments,
  MalformedAiResponseError,
  repairGalleryGeneration,
  streamGalleryGeneration,
} from './ai/generation';
import { raceWithAbort } from './http';

type Phase = 'gallery' | 'posts' | 'complete';

export interface GenerationCallbacks {
  onChunk: (text: string) => void | Promise<void>;
  onPhase: (phase: Phase, message: string, progress: number) => void | Promise<void>;
  onWarning?: (warning: GenerationWarning) => void | Promise<void>;
}

export const MAX_RAW_GALLERY_RESPONSE_CHARS = 1_048_576;
export const MAX_GROUNDING_SOURCES = 20;

export class InvalidGroundingSearchEntryPointError extends Error {
  readonly status = 502;
  readonly code = 'INVALID_GROUNDING_SEARCH_ENTRY_POINT';
  readonly retryable = false;

  constructor() {
    super('Google Search Suggestions metadata is missing or invalid.');
    this.name = 'InvalidGroundingSearchEntryPointError';
  }
}

class AiResponseTooLargeError extends Error {
  readonly status = 502;
  readonly code = 'AI_RESPONSE_TOO_LARGE';

  constructor() {
    super('AI 응답 크기가 허용 범위를 초과했습니다.');
    this.name = 'AiResponseTooLargeError';
  }
}

const makeId = (prefix: string): string => `${prefix}-${randomUUID()}`;

const errorStatus = (error: unknown): number | undefined => {
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const raw = candidate?.status ?? candidate?.statusCode ?? candidate?.code;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^\d{3}$/.test(raw)) return Number(raw);
  return undefined;
};

const isFatalEnrichmentError = (error: unknown): boolean => {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
    return true;
  return [401, 403, 404, 499, 504].includes(errorStatus(error) ?? 0);
};

const isProviderOutageError = (error: unknown): boolean => {
  if (
    error instanceof MalformedAiResponseError ||
    (error as { code?: unknown })?.code === 'MALFORMED_AI_RESPONSE'
  ) {
    return false;
  }
  const status = errorStatus(error);
  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
};

class EnrichmentCircuitOpenError extends Error {
  constructor() {
    super('AI 공급자 장애로 남은 게시물 보강을 건너뜁니다.');
    this.name = 'EnrichmentCircuitOpenError';
  }
}

interface LinkedAbort {
  controller: AbortController;
  dispose: () => void;
}

const makeLinkedAbortController = (parent?: AbortSignal): LinkedAbort => {
  const controller = new AbortController();
  const relayAbort = () =>
    controller.abort(parent?.reason ?? new DOMException('The request was aborted.', 'AbortError'));
  if (parent?.aborted) relayAbort();
  else parent?.addEventListener('abort', relayAbort, { once: true });
  return {
    controller,
    dispose: () => parent?.removeEventListener('abort', relayAbort),
  };
};

export const sanitizeGroundingSources = (
  sources: GroundingSource[],
): { sources: GroundingSource[]; dropped: number } => {
  const normalized: GroundingSource[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const source of sources) {
    if (normalized.length >= MAX_GROUNDING_SOURCES) {
      dropped += 1;
      continue;
    }
    if (typeof source.uri !== 'string' || source.uri.length > 2_048) {
      dropped += 1;
      continue;
    }
    try {
      const url = new URL(source.uri);
      if (url.protocol !== 'https:' || url.username || url.password) {
        dropped += 1;
        continue;
      }
      url.hash = '';
      const uri = url.toString();
      if (seen.has(uri)) {
        dropped += 1;
        continue;
      }
      seen.add(uri);
      normalized.push({
        uri,
        ...(typeof source.title === 'string' && source.title.trim()
          ? { title: source.title.trim().slice(0, 200) }
          : {}),
      });
    } catch {
      dropped += 1;
    }
  }
  return { sources: normalized, dropped };
};

const forbiddenGroundingElement =
  /<\s*\/?\s*(?:script|form|iframe|object|embed|base|meta|link|input|button|textarea|select|option|video|audio|source|img|picture|image|use|foreignobject|math|canvas)\b/i;
const forbiddenGroundingAttribute = /\s(?:on[a-z0-9_-]+|srcdoc)\s*=/i;
const forbiddenGroundingContent =
  /(?:javascript|vbscript|data)\s*:|@import\b|@font-face\b|expression\s*\(|url\s*\(|\\/i;

const hasDisallowedControlCharacter = (value: string): boolean =>
  [...value].some(character => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });

const isGoogleSearchDestination = (value: string): boolean => {
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    const isGoogleHost = url.hostname === 'google.com' || url.hostname.endsWith('.google.com');
    return url.protocol === 'https:' && isGoogleHost && !url.port && !url.username && !url.password;
  } catch {
    return false;
  }
};

/**
 * Accepts or rejects provider-owned markup without changing a single byte.
 * Rendering isolation remains the client's responsibility.
 */
export const validateGroundingSearchEntryPoint = (value: unknown): GroundingSearchEntryPoint => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES ||
    hasDisallowedControlCharacter(value) ||
    forbiddenGroundingElement.test(value) ||
    forbiddenGroundingAttribute.test(value) ||
    forbiddenGroundingContent.test(value) ||
    !/<style\b[^>]*>[\s\S]*<\/style\s*>/i.test(value)
  ) {
    throw new InvalidGroundingSearchEntryPointError();
  }

  const anchorTags = [...value.matchAll(/<a\b[^>]*>/gi)];
  if (anchorTags.length === 0) throw new InvalidGroundingSearchEntryPointError();
  let validatedHrefCount = 0;
  for (const match of anchorTags) {
    const anchor = match[0];
    const hrefs = [...anchor.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)];
    if (hrefs.length !== 1 || !isGoogleSearchDestination(hrefs[0]?.[2] ?? '')) {
      throw new InvalidGroundingSearchEntryPointError();
    }
    validatedHrefCount += 1;
  }
  const allHrefAssignments = value.match(/\bhref\s*=/gi)?.length ?? 0;
  if (allHrefAssignments !== validatedHrefCount) {
    throw new InvalidGroundingSearchEntryPointError();
  }

  return { renderedContent: value };
};

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
): Comment[] =>
  generated.map((comment, index) => ({
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
  await callbacks.onPhase('gallery', '갤러리 게시물을 생성하고 있습니다.', 20);
  const stream = await streamGalleryGeneration(ai, context, params.selectedModel, signal);
  const sources: GroundingSource[] = [];
  let overflowedSources = 0;
  let responseText = '';
  let searchMetadataSeen = false;
  let searchEntryPoint: GroundingSearchEntryPoint | undefined;

  for await (const chunk of stream) {
    responseText += chunk.text;
    if (responseText.length > MAX_RAW_GALLERY_RESPONSE_CHARS) throw new AiResponseTooLargeError();
    if (chunk.text) await callbacks.onChunk(chunk.text);
    const availableSourceSlots = Math.max(0, 100 - sources.length);
    sources.push(...chunk.sources.slice(0, availableSourceSlots));
    overflowedSources += Math.max(0, chunk.sources.length - availableSourceSlots);
    if (chunk.hasSearchMetadata) searchMetadataSeen = true;
    if (Object.hasOwn(chunk, 'searchEntryPointRenderedContent')) {
      const candidate = validateGroundingSearchEntryPoint(chunk.searchEntryPointRenderedContent);
      if (searchEntryPoint && searchEntryPoint.renderedContent !== candidate.renderedContent) {
        throw new InvalidGroundingSearchEntryPointError();
      }
      searchEntryPoint = candidate;
    }
  }

  if (searchMetadataSeen && !searchEntryPoint) {
    throw new InvalidGroundingSearchEntryPointError();
  }

  let generatedGallery;
  try {
    generatedGallery = parseGeminiResponse(responseText);
  } catch (firstError) {
    try {
      generatedGallery = parseGeminiResponse(
        await repairGalleryGeneration(ai, context, params.selectedModel, signal),
      );
    } catch (repairError) {
      throw new MalformedAiResponseError(repairError ?? firstError);
    }
  }
  if (!Array.isArray(generatedGallery.posts) || generatedGallery.posts.length === 0) {
    throw new Error('AI가 게시물 목록을 반환하지 않았습니다.');
  }

  await callbacks.onPhase('posts', '게시물 반응과 댓글을 생성하고 있습니다.', 60);
  const posts: Post[] = [];
  const warnings: GenerationWarning[] = [];
  const evaluationModel = EVALUATION_MODEL_BY_PROVIDER[params.selectedProvider];
  let evaluationCircuitOpen = false;
  let commentsCircuitOpen = false;

  for (const [postIndex, generatedPost] of generatedGallery.posts
    .slice(0, NUMBER_OF_POSTS)
    .entries()) {
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    const isBest = postIndex === 0;
    const postId = makeId('post');
    const postAuthor = generatedPost.author || `익명_${postIndex + 1}`;
    const minComments = isBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
    const maxComments = isBest ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;

    const enrichmentAbort = makeLinkedAbortController(signal);
    const enrichmentSignal = enrichmentAbort.controller.signal;
    const cancelSiblingOnFatal = async <T>(operation: Promise<T>): Promise<T> => {
      try {
        return await raceWithAbort(operation, enrichmentSignal);
      } catch (error) {
        if (isFatalEnrichmentError(error) && !enrichmentAbort.controller.signal.aborted) {
          enrichmentAbort.controller.abort(error);
        }
        throw error;
      }
    };
    const circuitError = new EnrichmentCircuitOpenError();
    const [metricsResult, commentsResult] = await Promise.allSettled([
      evaluationCircuitOpen
        ? Promise.reject<Awaited<ReturnType<typeof evaluatePost>>>(circuitError)
        : cancelSiblingOnFatal(
            evaluatePost(ai, generatedPost, context, evaluationModel, enrichmentSignal),
          ),
      commentsCircuitOpen
        ? Promise.reject<Awaited<ReturnType<typeof generateComments>>>(circuitError)
        : cancelSiblingOnFatal(
            generateComments(
              ai,
              generatedPost,
              context,
              minComments,
              maxComments,
              params.selectedModel,
              enrichmentSignal,
            ),
          ),
    ]);
    enrichmentAbort.dispose();
    if (metricsResult.status === 'rejected' && isFatalEnrichmentError(metricsResult.reason)) {
      throw metricsResult.reason;
    }
    if (commentsResult.status === 'rejected' && isFatalEnrichmentError(commentsResult.reason)) {
      throw commentsResult.reason;
    }
    if (metricsResult.status === 'rejected' && isProviderOutageError(metricsResult.reason)) {
      evaluationCircuitOpen = true;
    }
    if (commentsResult.status === 'rejected' && isProviderOutageError(commentsResult.reason)) {
      commentsCircuitOpen = true;
    }

    const metrics =
      metricsResult.status === 'fulfilled'
        ? metricsResult.value
        : {
            suggestedViews: 0,
            suggestedRecommendations: 0,
            suggestedNonRecommendations: 0,
          };
    const generatedComments = commentsResult.status === 'fulfilled' ? commentsResult.value : [];

    if (metricsResult.status === 'rejected') {
      const warning: GenerationWarning = {
        code: 'POST_EVALUATION_FALLBACK',
        message: '일부 게시물 반응 수치를 기본값으로 대체했습니다.',
        stage: 'evaluation',
        postId,
      };
      warnings.push(warning);
      await callbacks.onWarning?.(warning);
    }
    if (commentsResult.status === 'rejected') {
      const warning: GenerationWarning = {
        code: 'POST_COMMENTS_FALLBACK',
        message: '일부 게시물 댓글을 기본 댓글로 대체했습니다.',
        stage: 'comments',
        postId,
      };
      warnings.push(warning);
      await callbacks.onWarning?.(warning);
    }
    const comments = toComments(generatedComments, postId, postAuthor, isBest);
    while (commentsResult.status === 'fulfilled' && comments.length < minComments) {
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
      timestamp: getDetailedTimestamp(Math.random() * 60 * 60 * 1_000 * (postIndex + 1)),
      content: generatedPost.content || '게시물 내용이 없습니다.',
      views: metrics.suggestedViews,
      recommendations: metrics.suggestedRecommendations,
      nonRecommendations: metrics.suggestedNonRecommendations,
      comments,
    });

    const completedPostCount = postIndex + 1;
    const totalPostCount = Math.min(NUMBER_OF_POSTS, generatedGallery.posts.length);
    await callbacks.onPhase(
      'posts',
      `게시물 반응과 댓글을 생성하고 있습니다. (${completedPostCount}/${totalPostCount})`,
      60 + Math.round((completedPostCount / totalPostCount) * 35),
    );

    if (postIndex < Math.min(NUMBER_OF_POSTS, generatedGallery.posts.length) - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  posts.sort((left, right) => timestampToEpoch(right.timestamp) - timestampToEpoch(left.timestamp));
  const normalizedSources = sanitizeGroundingSources(sources);
  if (normalizedSources.dropped + overflowedSources > 0) {
    const warning: GenerationWarning = {
      code: 'GROUNDING_SOURCES_FILTERED',
      message: '안전하지 않거나 중복된 일부 검색 출처를 제외했습니다.',
      stage: 'grounding',
    };
    warnings.push(warning);
    await callbacks.onWarning?.(warning);
  }
  await callbacks.onPhase('complete', '갤러리 생성이 완료됐습니다.', 100);
  return {
    galleryTitle: generatedGallery.galleryTitle,
    posts,
    sources: normalizedSources.sources,
    ...(searchEntryPoint ? { searchEntryPoint } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
};

export const createUserPost = async (
  ai: GoogleGenAI,
  newPostData: NewPostData,
  contextParams: CreateGalleryParams,
  signal?: AbortSignal,
): Promise<AddUserPostResponse> => {
  const context = toPromptContext(contextParams);
  const warnings: GenerationWarning[] = [];
  let metrics;
  try {
    metrics = await evaluatePost(
      ai,
      newPostData,
      context,
      EVALUATION_MODEL_BY_PROVIDER[contextParams.selectedProvider],
      signal,
    );
  } catch (error) {
    if (isFatalEnrichmentError(error)) throw error;
    metrics = {
      suggestedViews: 0,
      suggestedRecommendations: 0,
      suggestedNonRecommendations: 0,
    };
    warnings.push({
      code: 'POST_EVALUATION_FALLBACK',
      message: '게시물 반응 수치를 0으로 대체했습니다.',
      stage: 'evaluation',
    });
  }
  const isBest = metrics.suggestedRecommendations >= 50;
  const minComments = isBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
  const maxComments = isBest ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;
  let generatedComments: Awaited<ReturnType<typeof generateComments>>;
  let commentsFailed = false;
  try {
    generatedComments = await generateComments(
      ai,
      newPostData,
      context,
      minComments,
      maxComments,
      contextParams.selectedModel,
      signal,
    );
  } catch (error) {
    if (isFatalEnrichmentError(error)) throw error;
    commentsFailed = true;
    generatedComments = [];
    warnings.push({
      code: 'POST_COMMENTS_FALLBACK',
      message: '게시물은 저장했지만 AI 댓글을 생성하지 못했습니다.',
      stage: 'comments',
    });
  }
  const postId = makeId('user-post');
  const comments = toComments(generatedComments, postId, newPostData.author, isBest);
  while (!commentsFailed && comments.length < minComments) {
    comments.push({
      id: makeId(`comment-fallback-${postId}`),
      author: `자동댓글${comments.length + 1}`,
      text: isBest ? '이 글은 좀 개념글 감이다.' : '그럴 수도 있겠네.',
      timestamp: getCurrentTimestamp(),
      recommendations: 0,
      nonRecommendations: 0,
    });
  }
  const post: Post = {
    ...newPostData,
    id: postId,
    timestamp: getDetailedTimestamp(),
    views: metrics.suggestedViews,
    recommendations: metrics.suggestedRecommendations,
    nonRecommendations: metrics.suggestedNonRecommendations,
    isBestPost: isBest,
    comments,
  };
  warnings.forEach(warning => {
    warning.postId = postId;
  });
  return { post, warnings };
};

export const createFollowUpComments = async (
  ai: GoogleGenAI,
  targetPost: Post,
  updatedComments: Comment[],
  contextParams: CreateGalleryParams,
  signal?: AbortSignal,
): Promise<Comment[]> => {
  const remainingCapacity = Math.max(0, MAX_TOTAL_COMMENTS_PER_POST - updatedComments.length);
  if (remainingCapacity === 0) return [];
  const maxComments = Math.min(MAX_AI_FOLLOW_UP_COMMENTS, remainingCapacity);
  const minComments = Math.min(MIN_AI_FOLLOW_UP_COMMENTS, maxComments);
  const generated = await generateFollowUpComments(
    ai,
    targetPost,
    updatedComments,
    toPromptContext(contextParams),
    minComments,
    maxComments,
    contextParams.selectedModel,
    signal,
  );
  const basePostAuthor = targetPost.author.startsWith(POST_AUTHOR_PREFIX)
    ? targetPost.author.slice(POST_AUTHOR_PREFIX.length)
    : targetPost.author;
  return generated.map((comment, index) => ({
    id: makeId(`ai-followup-${targetPost.id}-${index}`),
    author:
      comment.author === basePostAuthor ? `${POST_AUTHOR_PREFIX}${comment.author}` : comment.author,
    text: comment.text,
    timestamp: getCurrentTimestamp(),
    recommendations: comment.recommendations ?? Math.floor(Math.random() * 10),
    nonRecommendations: comment.nonRecommendations ?? Math.floor(Math.random() * 3),
  }));
};

export const createWorldviewFeedback = (
  ai: GoogleGenAI,
  customWorldviewText: string,
  galleryData: GalleryData,
  model: string,
  signal?: AbortSignal,
): Promise<string> => {
  // Grounding links and Search Suggestions are licensed transient display
  // metadata. Reconstruct the AI input explicitly so they cannot be analyzed,
  // cached, or repurposed by a follow-up provider call.
  const transientFreeGalleryData: GalleryData = {
    galleryTitle: galleryData.galleryTitle,
    posts: galleryData.posts,
    ...(galleryData.warnings ? { warnings: galleryData.warnings } : {}),
  };
  return generateFeedback(ai, customWorldviewText, transientFreeGalleryData, model, signal);
};
