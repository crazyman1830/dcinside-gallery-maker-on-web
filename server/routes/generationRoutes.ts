import { Router, type Request, type Response } from 'express';
import type { GoogleGenAI } from '@google/genai';
import type {
  AiProvider,
  Comment,
  CreateGalleryParams,
  GalleryData,
  NewPostData,
  Post,
} from '../../types';
import {
  createFollowUpComments,
  createGallery,
  createUserPost,
  createWorldviewFeedback,
} from '../galleryEngine';

export interface GenerationRouteDependencies {
  getSessionId: (request: Request) => string;
  getClient: (sessionId: string, provider: AiProvider) => GoogleGenAI | Promise<GoogleGenAI>;
  assertModelAllowed: (provider: AiProvider, model: string) => void;
  requestTimeoutMs?: number;
}

const activeSessions = new Set<string>();
export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;

const isProvider = (value: unknown): value is AiProvider => (
  value === 'gemini' || value === 'vertex'
);

const getStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) return undefined;
  const candidate = error as Error & {
    status?: number | string;
    statusCode?: number | string;
    code?: number | string;
  };
  const rawStatus = candidate.status ?? candidate.statusCode ?? candidate.code;
  if (typeof rawStatus === 'number') return rawStatus;
  if (typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus)) return Number(rawStatus);
  const match = error.message.match(/(?:HTTP|status(?: code)?)\s*[:=]?\s*(\d{3})/i);
  return match ? Number(match[1]) : undefined;
};

export const publicError = (error: unknown): { status: number; message: string } => {
  const status = getStatus(error);
  if (status === 400) return { status, message: 'AI 요청 형식이 올바르지 않습니다.' };
  if (status === 401) return { status, message: 'AI 자격 증명이 유효하지 않습니다.' };
  if (status === 403) return { status, message: '선택한 프로젝트 또는 모델을 사용할 권한이 없습니다.' };
  if (status === 404) return { status, message: '선택한 모델을 찾을 수 없습니다.' };
  if (status === 429) return { status, message: 'AI 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' };
  if (status && status >= 500) return { status: 502, message: 'AI 서비스가 일시적으로 응답하지 않습니다.' };

  if (error instanceof Error) {
    if (error.name === 'AbortError') return { status: 499, message: '요청이 취소됐습니다.' };
    const safeMessages = [
      'AI 요청 형식이 올바르지 않습니다.',
      'Gemini API 키가 올바르지 않습니다.',
      '선택한 AI 공급자의 자격 증명이 등록되지 않았습니다.',
      '지원하지 않는 AI 공급자입니다.',
      '지원하지 않는 모델입니다.',
      'AI가 게시물 목록을 반환하지 않았습니다.',
      '이미 이 세션에서 AI 생성 작업이 진행 중입니다.',
    ];
    const safe = safeMessages.find(message => error.message.startsWith(message));
    if (safe) return { status: safe.includes('이미') ? 409 : 400, message: safe };
  }
  return { status: 500, message: 'AI 요청을 처리하는 중 오류가 발생했습니다.' };
};

const parseGalleryParams = (
  value: unknown,
  assertModelAllowed: GenerationRouteDependencies['assertModelAllowed'],
): CreateGalleryParams => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI 요청 형식이 올바르지 않습니다.');
  }
  const candidate = value as Partial<CreateGalleryParams>;
  if (!isProvider(candidate.selectedProvider)) {
    throw new Error('지원하지 않는 AI 공급자입니다.');
  }
  if (typeof candidate.selectedModel !== 'string') {
    throw new Error('지원하지 않는 모델입니다.');
  }
  assertModelAllowed(candidate.selectedProvider, candidate.selectedModel);

  const requiredStrings: Array<keyof CreateGalleryParams> = [
    'topic',
    'discussionContext',
    'worldviewValue',
    'worldviewEraValue',
    'toxicityLevelValue',
    'anonymousNickRatioValue',
    'userSpecies',
    'userAffiliation',
    'genderRatioValue',
  ];
  if (requiredStrings.some(key => typeof candidate[key] !== 'string')) {
    throw new Error('AI 요청 형식이 올바르지 않습니다.');
  }
  if (!candidate.topic?.trim() || candidate.topic.length > 100) {
    throw new Error('AI 요청 형식이 올바르지 않습니다.');
  }
  if (!(typeof candidate.ageRangeValue === 'string' || (
    Array.isArray(candidate.ageRangeValue)
    && candidate.ageRangeValue.every(item => typeof item === 'string')
  ))) {
    throw new Error('AI 요청 형식이 올바르지 않습니다.');
  }
  if (typeof candidate.useSearch !== 'boolean') {
    throw new Error('AI 요청 형식이 올바르지 않습니다.');
  }
  return candidate as CreateGalleryParams;
};

const runExclusive = async <T>(sessionId: string, operation: () => Promise<T>): Promise<T> => {
  if (activeSessions.has(sessionId)) {
    throw new Error('이미 이 세션에서 AI 생성 작업이 진행 중입니다.');
  }
  activeSessions.add(sessionId);
  try {
    return await operation();
  } finally {
    activeSessions.delete(sessionId);
  }
};

interface RequestAbort {
  controller: AbortController;
  dispose: () => void;
}

const makeAbortController = (
  response: Response,
  timeoutMs: number,
): RequestAbort => {
  const controller = new AbortController();
  const handleClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', handleClose);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref();
  return {
    controller,
    dispose: () => {
      clearTimeout(timeout);
      response.off('close', handleClose);
    },
  };
};

const writeNdjson = (response: Response, event: unknown): void => {
  if (!response.writableEnded) response.write(`${JSON.stringify(event)}\n`);
};

export const createGenerationRouter = (dependencies: GenerationRouteDependencies): Router => {
  const router = Router();
  const requestTimeoutMs = dependencies.requestTimeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS;

  router.post('/gallery/stream', async (request, response) => {
    const sessionId = dependencies.getSessionId(request);
    let streamStarted = false;
    try {
      const params = parseGalleryParams(request.body, dependencies.assertModelAllowed);
      await runExclusive(sessionId, async () => {
        const client = await dependencies.getClient(sessionId, params.selectedProvider);
        const requestAbort = makeAbortController(response, requestTimeoutMs);
        response.status(200);
        response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.flushHeaders();
        streamStarted = true;
        try {
          const result = await createGallery(client, params, {
            onChunk: text => writeNdjson(response, { type: 'chunk', text }),
            onPhase: (phase, message) => writeNdjson(response, { type: 'phase', phase, message }),
          }, requestAbort.controller.signal);
          writeNdjson(response, { type: 'result', data: result });
        } finally {
          requestAbort.dispose();
        }
      });
      response.end();
    } catch (error) {
      const safe = publicError(error);
      if (streamStarted) {
        writeNdjson(response, { type: 'error', message: safe.message });
        response.end();
      } else {
        response.status(safe.status).json({ error: safe.message });
      }
    }
  });

  router.post('/posts', async (request, response) => {
    const sessionId = dependencies.getSessionId(request);
    try {
      const body = request.body as {
        newPostData?: NewPostData;
        galleryContext?: CreateGalleryParams;
      };
      const params = parseGalleryParams(body.galleryContext, dependencies.assertModelAllowed);
      if (!body.newPostData || ['title', 'author', 'content'].some(key => (
        typeof body.newPostData?.[key as keyof NewPostData] !== 'string'
      ))) throw new Error('AI 요청 형식이 올바르지 않습니다.');
      const result = await runExclusive(sessionId, async () => {
        const client = await dependencies.getClient(sessionId, params.selectedProvider);
        const requestAbort = makeAbortController(response, requestTimeoutMs);
        try {
          return await createUserPost(
            client,
            body.newPostData as NewPostData,
            params,
            requestAbort.controller.signal,
          );
        } finally {
          requestAbort.dispose();
        }
      });
      response.json(result);
    } catch (error) {
      const safe = publicError(error);
      response.status(safe.status).json({ error: safe.message });
    }
  });

  router.post('/comments/follow-up', async (request, response) => {
    const sessionId = dependencies.getSessionId(request);
    try {
      const body = request.body as {
        targetPost?: Post;
        updatedComments?: Comment[];
        galleryContext?: CreateGalleryParams;
      };
      const params = parseGalleryParams(body.galleryContext, dependencies.assertModelAllowed);
      if (!body.targetPost || !Array.isArray(body.updatedComments)) {
        throw new Error('AI 요청 형식이 올바르지 않습니다.');
      }
      const result = await runExclusive(sessionId, async () => {
        const client = await dependencies.getClient(sessionId, params.selectedProvider);
        const requestAbort = makeAbortController(response, requestTimeoutMs);
        try {
          return await createFollowUpComments(
            client,
            body.targetPost as Post,
            body.updatedComments as Comment[],
            params,
            requestAbort.controller.signal,
          );
        } finally {
          requestAbort.dispose();
        }
      });
      response.json(result);
    } catch (error) {
      const safe = publicError(error);
      response.status(safe.status).json({ error: safe.message });
    }
  });

  router.post('/worldview-feedback', async (request, response) => {
    const sessionId = dependencies.getSessionId(request);
    try {
      const body = request.body as {
        customWorldviewText?: string;
        galleryData?: GalleryData;
        selectedModel?: string;
        selectedProvider?: AiProvider;
      };
      const provider = body.selectedProvider ?? 'gemini';
      if (!isProvider(provider) || typeof body.selectedModel !== 'string') {
        throw new Error('AI 요청 형식이 올바르지 않습니다.');
      }
      dependencies.assertModelAllowed(provider, body.selectedModel);
      if (typeof body.customWorldviewText !== 'string' || !body.galleryData) {
        throw new Error('AI 요청 형식이 올바르지 않습니다.');
      }
      const feedback = await runExclusive(sessionId, async () => {
        const client = await dependencies.getClient(sessionId, provider);
        const requestAbort = makeAbortController(response, requestTimeoutMs);
        try {
          return await createWorldviewFeedback(
            client,
            body.customWorldviewText as string,
            body.galleryData as GalleryData,
            body.selectedModel as string,
            requestAbort.controller.signal,
          );
        } finally {
          requestAbort.dispose();
        }
      });
      response.json({ feedback });
    } catch (error) {
      const safe = publicError(error);
      response.status(safe.status).json({ error: safe.message });
    }
  });

  return router;
};
