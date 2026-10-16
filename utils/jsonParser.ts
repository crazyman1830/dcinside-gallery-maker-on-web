import type { GeminiCommentContent, GeminiEvaluationResponse, GeminiResponseData } from '../types';
import {
  geminiCommentContentSchema,
  geminiEvaluationResponseSchema,
  geminiResponseDataSchema,
} from '../schemas';

const MALFORMED_PREFIX = 'AI 응답 형식이 올바르지 않습니다';

export interface AiResponseIssue {
  path: string;
  code: 'invalid_json' | 'invalid_type' | 'too_small' | 'too_big' | 'constraint' | 'count';
  expectedCount?: number;
}

/** Safe diagnostics only: never carry provider text or validation messages. */
export class AiResponseValidationError extends Error {
  constructor(
    message: string,
    readonly issues: AiResponseIssue[],
  ) {
    super(message);
    this.name = 'AiResponseValidationError';
  }
}

const responseFields = new Set([
  'galleryTitle',
  'posts',
  'title',
  'author',
  'content',
  'comments',
  'text',
  'recommendations',
  'nonRecommendations',
  'suggestedViews',
  'suggestedRecommendations',
  'suggestedNonRecommendations',
]);

const schemaError = (
  message: string,
  issues: ReadonlyArray<{ code: string; path: readonly PropertyKey[] }>,
): AiResponseValidationError =>
  new AiResponseValidationError(
    message,
    issues.slice(0, 6).map(issue => ({
      path: issue.path.reduce<string>((path, segment) => {
        if (typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0) {
          return `${path}[${segment}]`;
        }
        return typeof segment === 'string' && responseFields.has(segment)
          ? `${path}.${segment}`
          : path;
      }, '$'),
      code:
        issue.code === 'invalid_type' || issue.code === 'too_small' || issue.code === 'too_big'
          ? issue.code
          : 'constraint',
    })),
  );

/** Removes JavaScript-style comments without touching comment markers inside strings. */
export const stripJsonComments = (input: string): string => {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];
    if (lineComment) {
      if (current === '\n' || current === '\r') {
        lineComment = false;
        result += current;
      }
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        index += 1;
      } else if (current === '\n' || current === '\r') {
        result += current;
      }
      continue;
    }
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
    } else if (current === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (current === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else {
      result += current;
    }
  }
  return result;
};

const findBalancedJsonEnd = (text: string, start: number): number => {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const current = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      continue;
    }
    if (current === '{' || current === '[') stack.push(current);
    else if (current === '}' || current === ']') {
      const opening = stack.pop();
      if ((current === '}' && opening !== '{') || (current === ']' && opening !== '[')) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
};

/**
 * Finds the first syntactically valid JSON object/array. Balanced delimiters
 * inside quoted strings and escaped quotes are ignored.
 */
export const extractJsonString = (responseText: string): string => {
  const trimmed = responseText.trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)].map(match => match[1]);
  const candidates = [...fenced, trimmed].map(stripJsonComments);

  for (const candidate of candidates) {
    for (let start = 0; start < candidate.length; start += 1) {
      if (candidate[start] !== '{' && candidate[start] !== '[') continue;
      const end = findBalancedJsonEnd(candidate, start);
      if (end < 0) continue;
      const json = candidate.slice(start, end + 1);
      try {
        JSON.parse(json);
        return json;
      } catch {
        // A prose bracket can precede the actual JSON payload; keep looking.
      }
    }
  }
  throw new AiResponseValidationError(`${MALFORMED_PREFIX}: JSON 객체나 배열을 찾지 못했습니다.`, [
    { path: '$', code: 'invalid_json' },
  ]);
};

export function parseProtectedJson<T>(
  responseText: string,
  typeGuard: (parsed: unknown) => parsed is T,
  errorContextName: string,
): T {
  try {
    const parsed: unknown = JSON.parse(extractJsonString(responseText));
    if (typeGuard(parsed)) return parsed;
    throw new Error(`${MALFORMED_PREFIX}: ${errorContextName} 데이터 구조가 일치하지 않습니다.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(MALFORMED_PREFIX)) throw error;
    // Deliberately never log the raw provider response; it can contain user data.
    throw new Error(`${MALFORMED_PREFIX}: ${errorContextName} JSON을 해석하지 못했습니다.`);
  }
}

export function isGeminiResponseData(parsed: unknown): parsed is GeminiResponseData {
  return geminiResponseDataSchema.safeParse(parsed).success;
}

export function isGeminiCommentContentArray(parsed: unknown): parsed is GeminiCommentContent[] {
  return (
    Array.isArray(parsed) &&
    parsed.every(item => geminiCommentContentSchema.safeParse(item).success)
  );
}

export function isGeminiEvaluationResponse(parsed: unknown): parsed is GeminiEvaluationResponse {
  return geminiEvaluationResponseSchema.safeParse(parsed).success;
}

const parseUnknownJson = (responseText: string): unknown => {
  try {
    return JSON.parse(extractJsonString(responseText));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(MALFORMED_PREFIX)) throw error;
    throw new Error(`${MALFORMED_PREFIX}: JSON을 해석하지 못했습니다.`);
  }
};

export function parseGeminiResponse(responseText: string): GeminiResponseData {
  const result = geminiResponseDataSchema.safeParse(parseUnknownJson(responseText));
  if (!result.success) {
    throw schemaError(
      `${MALFORMED_PREFIX}: 갤러리 데이터 구조가 일치하지 않습니다.`,
      result.error.issues,
    );
  }
  return result.data;
}

export function parseGeminiCommentArrayResponse(responseText: string): GeminiCommentContent[] {
  const raw = parseUnknownJson(responseText);
  let comments: unknown;
  if (Array.isArray(raw)) comments = raw;
  else if (raw && typeof raw === 'object' && 'comments' in raw) comments = raw.comments;
  else if (raw && typeof raw === 'object' && 'replies' in raw) comments = raw.replies;
  else
    throw new AiResponseValidationError(`${MALFORMED_PREFIX}: 댓글 배열을 찾지 못했습니다.`, [
      { path: '$', code: 'invalid_type' },
    ]);

  if (!Array.isArray(comments)) {
    throw new AiResponseValidationError(`${MALFORMED_PREFIX}: 댓글 데이터는 배열이어야 합니다.`, [
      { path: '$', code: 'invalid_type' },
    ]);
  }
  const normalized = comments.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const candidate = item as Record<string, unknown>;
    return {
      author: candidate.author ?? candidate.nickname ?? candidate.user ?? candidate.username,
      text: candidate.text ?? candidate.content ?? candidate.comment ?? candidate.message,
      recommendations: candidate.recommendations,
      nonRecommendations: candidate.nonRecommendations,
    };
  });
  const result = geminiCommentContentSchema.array().safeParse(normalized);
  if (!result.success) {
    throw schemaError(
      `${MALFORMED_PREFIX}: 비어 있거나 잘못된 댓글이 포함되어 있습니다.`,
      result.error.issues,
    );
  }
  return result.data;
}

export function parseGeminiEvaluationResponse(responseText: string): GeminiEvaluationResponse {
  const result = geminiEvaluationResponseSchema.safeParse(parseUnknownJson(responseText));
  if (!result.success) {
    throw schemaError(
      `${MALFORMED_PREFIX}: 평가 지표는 범위 내 정수여야 하며 총 추천·비추천 수는 조회수를 넘을 수 없습니다.`,
      result.error.issues,
    );
  }
  return result.data;
}
