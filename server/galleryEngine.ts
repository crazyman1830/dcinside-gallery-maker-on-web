import { randomUUID } from 'node:crypto';
import type { GoogleGenAI } from '@google/genai';
import type {
  AddUserPostResponse,
  Comment,
  CreateGalleryParams,
  CreateGalleryRequest,
  FollowUpPostContext,
  GalleryData,
  GenerationWarning,
  GroundingSearchEntryPoint,
  GroundingSource,
  NewPostData,
  Post,
  WorldviewFeedbackGallerySample,
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
import {
  getCurrentTimestamp,
  getDetailedTimestamp,
  resolveUserNickname,
  timestampToEpoch,
} from '../utils/common';
import { parseGeminiResponse } from '../utils/jsonParser';
import {
  evaluatePost,
  evaluatePostsBatch,
  generateComments,
  generateCommentsBatch,
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
  onCheckpoint?: (data: GalleryData) => void | Promise<void>;
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
const MAX_GENERATED_AUTHOR_LENGTH = 64;

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

const stripPostAuthorPrefix = (author: string): string =>
  author.startsWith(POST_AUTHOR_PREFIX) ? author.slice(POST_AUTHOR_PREFIX.length).trim() : author;

const conflictsWithActiveUser = (author: string, context: PromptContext): boolean => {
  const normalized = stripPostAuthorPrefix(author.trim());
  const activeUser = resolveUserNickname(context.userProfile ?? null);
  if (activeUser && normalized === activeUser) return true;
  const activeIp =
    context.userProfile?.nicknameType === 'ANONYMOUS' ? context.userProfile.ip : undefined;
  return Boolean(activeIp && normalized.includes(activeIp));
};

const isReservedGeneratedAuthor = (author: string, context: PromptContext): boolean =>
  !author || author === '나' || author === '(글쓴이)' || conflictsWithActiveUser(author, context);

const makeSafeFallbackAuthor = (
  fallbackIndex: number,
  context: PromptContext,
  forbiddenAuthors: string[] = [],
  separator = '',
): string => {
  const forbidden = new Set(forbiddenAuthors.map(author => stripPostAuthorPrefix(author.trim())));
  let suffix = fallbackIndex + 1;
  while (true) {
    const candidate = `익명${separator}${suffix}`;
    if (!forbidden.has(candidate) && !isReservedGeneratedAuthor(candidate, context)) {
      return candidate;
    }
    suffix += 1;
  }
};

const sanitizeGeneratedPostAuthor = (
  currentAuthor: string,
  fallbackIndex: number,
  context: PromptContext,
): string => {
  const normalized = stripPostAuthorPrefix(currentAuthor.trim()).slice(
    0,
    MAX_GENERATED_AUTHOR_LENGTH,
  );
  if (isReservedGeneratedAuthor(normalized, context)) {
    return makeSafeFallbackAuthor(fallbackIndex, context, [], '_');
  }
  return normalized;
};

const ensureUniqueCommentAuthor = (
  currentAuthor: string,
  postAuthor: string,
  fallbackIndex: number,
  context: PromptContext,
): string => {
  const normalized = stripPostAuthorPrefix(currentAuthor.trim()).slice(
    0,
    MAX_GENERATED_AUTHOR_LENGTH,
  );
  const candidate = normalized || `익명${fallbackIndex + 1}`;
  if (isReservedGeneratedAuthor(candidate, context)) {
    return makeSafeFallbackAuthor(fallbackIndex, context, [postAuthor]);
  }
  return candidate === postAuthor
    ? `${POST_AUTHOR_PREFIX}${candidate.slice(0, MAX_GENERATED_AUTHOR_LENGTH - POST_AUTHOR_PREFIX.length)}`
    : candidate;
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
  ...(params.fixedNicknames ? { fixedNicknames: params.fixedNicknames } : {}),
  ...(params.continuityNotes ? { continuityNotes: params.continuityNotes } : {}),
});

const toComments = (
  generated: Awaited<ReturnType<typeof generateComments>>,
  postId: string,
  postAuthor: string,
  isBest: boolean,
  context: PromptContext,
): Comment[] =>
  generated.map((comment, index) => ({
    id: makeId(`comment-${postId}`),
    author: ensureUniqueCommentAuthor(comment.author, postAuthor, index, context),
    text: comment.text || '...',
    timestamp: getCurrentTimestamp(),
    recommendations: comment.recommendations ?? Math.floor(Math.random() * (isBest ? 50 : 15)),
    nonRecommendations: comment.nonRecommendations ?? Math.floor(Math.random() * 5),
  }));

const makeEnrichmentWarning = (
  stage: 'evaluation' | 'comments',
  postId: string,
): GenerationWarning => ({
  code: stage === 'evaluation' ? 'POST_EVALUATION_FALLBACK' : 'POST_COMMENTS_FALLBACK',
  message:
    stage === 'evaluation'
      ? '게시물 반응 수치를 생성하지 못했습니다. 해당 단계만 다시 생성할 수 있습니다.'
      : 'AI 댓글을 생성하지 못했습니다. 해당 단계만 다시 생성할 수 있습니다.',
  stage,
  postId,
});

export const createGallery = async (
  ai: GoogleGenAI,
  params: CreateGalleryRequest,
  callbacks: GenerationCallbacks,
  signal?: AbortSignal,
): Promise<GalleryData> => {
  const context = toPromptContext(params);
  const generationContext: PromptContext = params.continuationContext
    ? { ...context, continuationContext: params.continuationContext }
    : context;
  await callbacks.onPhase('gallery', '갤러리 게시물을 생성하고 있습니다.', 20);
  const stream = await streamGalleryGeneration(ai, generationContext, params.selectedModel, signal);
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

  if (params.useSearch && (!searchMetadataSeen || !searchEntryPoint)) {
    throw new InvalidGroundingSearchEntryPointError();
  }

  let generatedGallery;
  try {
    generatedGallery = parseGeminiResponse(responseText);
  } catch (firstError) {
    // A second generation without collecting a fresh grounding bundle could
    // attach stale sources to different text. Search mode therefore fails as
    // one atomic grounded response instead of performing an ungrounded repair.
    if (params.useSearch) throw new MalformedAiResponseError(firstError);
    try {
      generatedGallery = parseGeminiResponse(
        await repairGalleryGeneration(
          ai,
          generationContext,
          params.selectedModel,
          signal,
          firstError,
        ),
      );
    } catch (repairError) {
      throw new MalformedAiResponseError(repairError ?? firstError);
    }
  }
  if (!Array.isArray(generatedGallery.posts) || generatedGallery.posts.length === 0) {
    throw new Error('AI가 게시물 목록을 반환하지 않았습니다.');
  }

  await callbacks.onPhase('posts', '게시물 반응과 댓글을 생성하고 있습니다.', 60);
  const warnings: GenerationWarning[] = [];
  const posts: Post[] = generatedGallery.posts
    .slice(0, NUMBER_OF_POSTS)
    .map((generatedPost, index) => ({
      id: makeId('post'),
      isBestPost: index === 0,
      title: generatedPost.title,
      author: sanitizeGeneratedPostAuthor(generatedPost.author, index, context),
      timestamp: getDetailedTimestamp(Math.random() * 60 * 60 * 1_000 * (index + 1)),
      content: generatedPost.content,
      views: 0,
      recommendations: 0,
      nonRecommendations: 0,
      comments: [],
    }));
  const commentRequests = posts.map(post => {
    const minimum = post.isBestPost ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
    const maximum = post.isBestPost ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;
    return {
      ...post,
      requestedCommentCount: minimum + Math.floor(Math.random() * (maximum - minimum + 1)),
    };
  });
  const completedEvaluations = new Set<string>();
  const completedComments = new Set<string>();
  const pendingWarnings = (): GenerationWarning[] =>
    posts.flatMap(post => [
      ...(!completedEvaluations.has(post.id) ? [makeEnrichmentWarning('evaluation', post.id)] : []),
      ...(!completedComments.has(post.id) ? [makeEnrichmentWarning('comments', post.id)] : []),
    ]);
  const snapshot = (): GalleryData => ({
    galleryTitle: generatedGallery.galleryTitle,
    posts: posts.map(post => ({ ...post, comments: [...post.comments] })),
    warnings: pendingWarnings(),
  });
  // These snapshots are recovery data only; the UI continues to wait for the
  // final result. Grounded responses remain atomic and never emit checkpoints.
  if (!params.useSearch) await callbacks.onCheckpoint?.(snapshot());
  let checkpointQueue = Promise.resolve();
  let checkpointFailure: unknown;
  const enqueueCheckpoint = (): void => {
    if (params.useSearch || !callbacks.onCheckpoint) return;
    const data = snapshot();
    checkpointQueue = checkpointQueue.then(async () => {
      if (signal?.aborted || checkpointFailure) return;
      try {
        await callbacks.onCheckpoint?.(data);
      } catch (error) {
        // Transport failures must never become provider retries or warnings.
        checkpointFailure = error;
      }
    });
  };
  const enrichmentAbort = makeLinkedAbortController(signal);
  const enrichmentSignal = enrichmentAbort.controller.signal;
  const cancelSiblingOnFatal = async <T>(operation: Promise<T>): Promise<T> => {
    try {
      return await raceWithAbort(operation, enrichmentSignal);
    } catch (error) {
      if (isFatalEnrichmentError(error) && !enrichmentSignal.aborted) {
        enrichmentAbort.controller.abort(error);
      }
      throw error;
    }
  };
  try {
    await Promise.allSettled([
      cancelSiblingOnFatal(
        evaluatePostsBatch(
          ai,
          posts,
          context,
          EVALUATION_MODEL_BY_PROVIDER[params.selectedProvider],
          enrichmentSignal,
        ),
      ).then(metricsByPost => {
        for (const post of posts) {
          const metrics = metricsByPost.get(post.id);
          if (!metrics) continue;
          post.views = metrics.suggestedViews;
          post.recommendations = metrics.suggestedRecommendations;
          post.nonRecommendations = metrics.suggestedNonRecommendations;
          completedEvaluations.add(post.id);
        }
        enqueueCheckpoint();
      }),
      cancelSiblingOnFatal(
        generateCommentsBatch(ai, commentRequests, context, params.selectedModel, enrichmentSignal),
      ).then(commentsByPost => {
        for (const post of posts) {
          const comments = commentsByPost.get(post.id);
          if (!comments) continue;
          post.comments = toComments(
            comments,
            post.id,
            post.author,
            Boolean(post.isBestPost),
            context,
          );
          completedComments.add(post.id);
        }
        enqueueCheckpoint();
      }),
    ]);
  } finally {
    enrichmentAbort.dispose();
  }
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
  await checkpointQueue;
  if (checkpointFailure) throw checkpointFailure;
  warnings.push(...pendingWarnings());
  for (const warning of warnings) await callbacks.onWarning?.(warning);
  await callbacks.onPhase('posts', '게시물 반응과 댓글 처리가 완료됐습니다.', 95);
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
  const comments = toComments(generatedComments, postId, newPostData.author, isBest, context);
  while (!commentsFailed && comments.length < minComments) {
    comments.push({
      id: makeId(`comment-fallback-${postId}`),
      author: ensureUniqueCommentAuthor(
        `자동댓글${comments.length + 1}`,
        newPostData.author,
        comments.length,
        context,
      ),
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

/** Only our historic generated placeholder signature is safe to replace. */
const isLegacyFallbackComment = (comment: Comment, postId: string): boolean =>
  comment.id.startsWith(`comment-fallback-${postId}-`) &&
  /^자동댓글\d+$/.test(comment.author) &&
  ['이 글은 좀 개념글 감이다.', '그럴 수도 있겠네.'].includes(comment.text) &&
  !comment.voted &&
  !comment.replyTo &&
  comment.recommendations === 0 &&
  comment.nonRecommendations === 0;

export const retryPostStage = async (
  ai: GoogleGenAI,
  post: Post,
  stage: 'evaluation' | 'comments',
  contextParams: CreateGalleryParams,
  signal?: AbortSignal,
): Promise<AddUserPostResponse> => {
  const context = toPromptContext(contextParams);
  const target = { title: post.title, author: post.author, content: post.content };
  try {
    if (stage === 'evaluation') {
      const metrics = await evaluatePost(
        ai,
        target,
        context,
        EVALUATION_MODEL_BY_PROVIDER[contextParams.selectedProvider],
        signal,
      );
      const recommendations = metrics.suggestedRecommendations + (post.voted === 'rec' ? 1 : 0);
      const nonRecommendations =
        metrics.suggestedNonRecommendations + (post.voted === 'nonrec' ? 1 : 0);
      return {
        post: {
          ...post,
          views: Math.max(metrics.suggestedViews, recommendations + nonRecommendations),
          recommendations,
          nonRecommendations,
        },
        warnings: [],
      };
    }
    const referencedComments = new Set(
      post.comments.flatMap(comment => (comment.replyTo ? [comment.replyTo.commentId] : [])),
    );
    const preservedComments = post.comments.filter(
      comment => referencedComments.has(comment.id) || !isLegacyFallbackComment(comment, post.id),
    );
    const remaining = MAX_TOTAL_COMMENTS_PER_POST - preservedComments.length;
    if (remaining <= 0) {
      return {
        post,
        warnings: [
          {
            ...makeEnrichmentWarning(stage, post.id),
            message: '댓글 상한에 도달해 새 AI 댓글을 생성할 수 없습니다.',
          },
        ],
      };
    }
    const minimum = Math.min(
      remaining,
      post.isBestPost ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST,
    );
    const maximum = Math.min(
      remaining,
      post.isBestPost ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST,
    );
    const generated = await generateComments(
      ai,
      target,
      context,
      minimum,
      maximum,
      contextParams.selectedModel,
      signal,
    );
    return {
      post: {
        ...post,
        comments: [
          ...preservedComments,
          ...toComments(generated, post.id, post.author, Boolean(post.isBestPost), context),
        ],
      },
      warnings: [],
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return { post, warnings: [makeEnrichmentWarning(stage, post.id)] };
  }
};
export const createFollowUpComments = async (
  ai: GoogleGenAI,
  targetPost: FollowUpPostContext,
  recentComments: Comment[],
  totalCommentCount: number,
  contextParams: CreateGalleryParams,
  signal?: AbortSignal,
  replyTargetComment?: Comment,
): Promise<Comment[]> => {
  const remainingCapacity = Math.max(0, MAX_TOTAL_COMMENTS_PER_POST - totalCommentCount);
  if (remainingCapacity === 0) return [];
  const maxComments = Math.min(MAX_AI_FOLLOW_UP_COMMENTS, remainingCapacity);
  const minComments = Math.min(MIN_AI_FOLLOW_UP_COMMENTS, maxComments);
  const generated = await generateFollowUpComments(
    ai,
    targetPost,
    recentComments,
    totalCommentCount,
    toPromptContext(contextParams),
    minComments,
    maxComments,
    contextParams.selectedModel,
    signal,
    replyTargetComment,
  );
  const basePostAuthor = targetPost.author.startsWith(POST_AUTHOR_PREFIX)
    ? targetPost.author.slice(POST_AUTHOR_PREFIX.length)
    : targetPost.author;
  const context = toPromptContext(contextParams);
  return generated.map((comment, index) => ({
    id: makeId(`ai-followup-${targetPost.id}-${index}`),
    author: ensureUniqueCommentAuthor(comment.author, basePostAuthor, index, context),
    text: comment.text,
    timestamp: getCurrentTimestamp(),
    recommendations: comment.recommendations ?? Math.floor(Math.random() * 10),
    nonRecommendations: comment.nonRecommendations ?? Math.floor(Math.random() * 3),
  }));
};

export const createWorldviewFeedback = (
  ai: GoogleGenAI,
  customWorldviewText: string,
  gallerySample: WorldviewFeedbackGallerySample,
  model: string,
  signal?: AbortSignal,
): Promise<string> => {
  return generateFeedback(ai, customWorldviewText, gallerySample, model, signal);
};
