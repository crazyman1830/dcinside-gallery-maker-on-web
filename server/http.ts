import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ZodError } from 'zod';

export interface PublicError {
  status: number;
  message: string;
  code: string;
  retryable: boolean;
  field?: string;
  retryAfterSeconds?: number;
}

export class RequestValidationError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_REQUEST';
  readonly retryable = false;

  constructor(
    message = 'AI 요청 형식이 올바르지 않습니다.',
    readonly field?: string,
  ) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export class SearchGroundingDisabledError extends Error {
  readonly status = 400;
  readonly code = 'SEARCH_GROUNDING_DISABLED';
  readonly retryable = false;

  constructor() {
    super('Google Search 기반 생성은 이 릴리스에서 사용할 수 없습니다.');
    this.name = 'SearchGroundingDisabledError';
  }
}

export class AiTimeoutError extends Error {
  readonly status = 504;
  readonly code = 'AI_TIMEOUT';
  readonly retryable = true;

  constructor() {
    super('AI 응답 대기 시간이 초과됐습니다. 다시 시도해 주세요.');
    this.name = 'AiTimeoutError';
  }
}

export class ClientAbortError extends Error {
  readonly status = 499;
  readonly code = 'CLIENT_ABORTED';
  readonly retryable = false;

  constructor() {
    super('요청이 취소됐습니다.');
    this.name = 'ClientAbortError';
  }
}

export const requestIdMiddleware = (
  _request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};

export const getRequestId = (response: Response): string =>
  typeof response.locals.requestId === 'string' ? response.locals.requestId : 'unknown';

const errorCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : undefined;
};

const errorStatus = (error: unknown): number | undefined => {
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const raw = candidate?.status ?? candidate?.statusCode ?? candidate?.code;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 400 && raw <= 599) return raw;
  if (typeof raw === 'string' && /^\d{3}$/.test(raw)) return Number(raw);
  if (error instanceof Error) {
    const match = error.message.match(/(?:HTTP|status(?: code)?)\s*[:=]?\s*(\d{3})/i);
    if (match) return Number(match[1]);
  }
  return undefined;
};

export const toPublicError = (error: unknown): PublicError => {
  if (error instanceof AiTimeoutError) {
    return { status: 504, message: error.message, code: error.code, retryable: true };
  }
  if (
    error instanceof ClientAbortError ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return {
      status: 499,
      message: '요청이 취소됐습니다.',
      code: 'CLIENT_ABORTED',
      retryable: false,
    };
  }
  if (error instanceof RequestValidationError) {
    return {
      status: 400,
      message: error.message,
      code: error.code,
      retryable: false,
      field: error.field,
    };
  }
  if (error instanceof SearchGroundingDisabledError) {
    return {
      status: error.status,
      message: error.message,
      code: error.code,
      retryable: error.retryable,
    };
  }

  const status = errorStatus(error);
  const code = errorCode(error);
  const knownMessage = error instanceof Error ? error.message : '';
  const explicitRetryable = (error as { retryable?: unknown })?.retryable;
  const retryAfter = (error as { retryAfterSeconds?: unknown })?.retryAfterSeconds;
  const retryAfterSeconds =
    typeof retryAfter === 'number' && Number.isFinite(retryAfter)
      ? Math.max(1, Math.min(60, Math.ceil(retryAfter)))
      : undefined;

  if (status === 400)
    return {
      status,
      message: 'AI 요청 형식이 올바르지 않습니다.',
      code: code ?? 'INVALID_REQUEST',
      retryable: false,
    };
  if (status === 401)
    return {
      status,
      message: 'AI 자격 증명이 유효하지 않습니다.',
      code: code ?? 'AI_UNAUTHORIZED',
      retryable: false,
    };
  if (status === 403)
    return {
      status,
      message: '선택한 프로젝트 또는 모델을 사용할 권한이 없습니다.',
      code: code ?? 'AI_FORBIDDEN',
      retryable: false,
    };
  if (status === 404)
    return {
      status,
      message:
        code === 'API_NOT_FOUND' || code === 'AI_PROVIDER_NOT_FOUND'
          ? knownMessage
          : '선택한 모델을 찾을 수 없습니다.',
      code: code ?? 'AI_MODEL_NOT_FOUND',
      retryable: false,
    };
  if (status === 409)
    return {
      status,
      message: knownMessage || 'AI 작업이 이미 진행 중입니다.',
      code: code ?? 'AI_SESSION_BUSY',
      retryable: false,
    };
  if (status === 413)
    return {
      status,
      message: '요청 본문 크기 제한을 초과했습니다.',
      code: code ?? 'PAYLOAD_TOO_LARGE',
      retryable: false,
    };
  if (status === 429)
    return {
      status,
      message: knownMessage || 'AI 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
      code: code ?? 'AI_RATE_LIMITED',
      retryable: explicitRetryable !== false,
      retryAfterSeconds,
    };
  if (status === 503 && code === 'SESSION_CAPACITY')
    return {
      status,
      message: knownMessage,
      code,
      retryable: true,
      retryAfterSeconds: retryAfterSeconds ?? 1,
    };
  if (status && status >= 500)
    return {
      status: status === 504 ? 504 : 502,
      message:
        status === 504
          ? 'AI 응답 대기 시간이 초과됐습니다. 다시 시도해 주세요.'
          : 'AI 서비스가 일시적으로 응답하지 않습니다.',
      code: code ?? (status === 504 ? 'AI_TIMEOUT' : 'AI_UPSTREAM_ERROR'),
      retryable: explicitRetryable !== false,
    };

  const safeMessages = [
    'Gemini API 키가 올바르지 않습니다.',
    '선택한 AI 공급자의 자격 증명이 등록되지 않았습니다.',
    '지원하지 않는 AI 공급자입니다.',
    '지원하지 않는 모델입니다.',
    'AI가 게시물 목록을 반환하지 않았습니다.',
    '로컬 세션이 만료되었습니다.',
  ];
  const safe = safeMessages.find(message => knownMessage.startsWith(message));
  if (safe)
    return {
      status: 400,
      message: knownMessage,
      code: code ?? 'AI_CONFIGURATION_ERROR',
      retryable: false,
    };
  return {
    status: 500,
    message: 'AI 요청을 처리하는 중 오류가 발생했습니다.',
    code: code ?? 'INTERNAL_ERROR',
    retryable: false,
  };
};

export const zodValidationError = (error: ZodError): RequestValidationError => {
  const issue = error.issues[0];
  return new RequestValidationError(
    'AI 요청 형식이 올바르지 않습니다.',
    issue?.path.length ? issue.path.join('.') : undefined,
  );
};

export const sendPublicError = (response: Response, error: unknown): void => {
  const safe = toPublicError(error);
  if (process.env.NODE_ENV !== 'test') {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'request_error',
        requestId: getRequestId(response),
        code: safe.code,
        status: safe.status,
        retryable: safe.retryable,
      }),
    );
  }
  if (safe.retryAfterSeconds) response.setHeader('Retry-After', String(safe.retryAfterSeconds));
  response.status(safe.status).json({
    error: safe.message,
    code: safe.code,
    retryable: safe.retryable,
    requestId: getRequestId(response),
    ...(safe.field ? { field: safe.field } : {}),
  });
};

export const raceWithAbort = async <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) throw signal.reason ?? new ClientAbortError();
  let removeAbortListener = (): void => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new ClientAbortError());
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  // A provider that ignores AbortSignal may settle after the HTTP request. Its
  // rejection must still be observed to avoid an unhandled rejection.
  operation.catch(() => undefined);
  try {
    return await Promise.race([operation, aborted]);
  } catch (error) {
    if (signal.aborted && signal.reason) throw signal.reason;
    throw error;
  } finally {
    removeAbortListener();
  }
};
