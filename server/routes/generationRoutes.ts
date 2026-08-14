import { Router, type Request, type Response } from 'express';
import type { GoogleGenAI } from '@google/genai';
import type { AiProvider } from '../../types';
import { SEARCH_GROUNDING_RELEASE_ENABLED } from '../../constants';
import {
  addUserPostRequestSchema,
  createGalleryParamsSchema,
  followUpCommentsRequestSchema,
  worldviewFeedbackRequestSchema,
} from '../../schemas';
import {
  createFollowUpComments,
  createGallery,
  createUserPost,
  createWorldviewFeedback,
} from '../galleryEngine';
import { aiAdmissionLimiter, type AiAdmissionLimiter } from '../ai/admission';
import {
  AiTimeoutError,
  ClientAbortError,
  getRequestId,
  raceWithAbort,
  SearchGroundingDisabledError,
  sendPublicError,
  toPublicError,
  zodValidationError,
} from '../http';

export interface GenerationRouteDependencies {
  getSessionId: (request: Request) => string;
  getClient: (sessionId: string, provider: AiProvider) => GoogleGenAI | Promise<GoogleGenAI>;
  assertModelAllowed: (provider: AiProvider, model: string) => void;
  requestTimeoutMs?: number;
  limiter?: Pick<AiAdmissionLimiter, 'run'>;
}

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;
export const POST_REQUEST_TIMEOUT_MS = 2 * 60 * 1_000;
export const FOLLOW_UP_REQUEST_TIMEOUT_MS = 90 * 1_000;
export const FEEDBACK_REQUEST_TIMEOUT_MS = 60 * 1_000;
export const NDJSON_MAX_LINE_BYTES = 512 * 1_024;
export const NDJSON_MAX_TOTAL_BYTES = 1_024 * 1_024;

// Kept as a compatibility export for credential routes and existing callers.
export const publicError = toPublicError;

interface RequestAbort {
  signal: AbortSignal;
  dispose: () => void;
}

interface NdjsonBudget {
  bytesWritten: number;
}

class NdjsonOutputLimitError extends Error {
  readonly status = 502;
  readonly code = 'AI_RESPONSE_TOO_LARGE';
  readonly retryable = false;

  constructor(scope: 'line' | 'response') {
    super(
      scope === 'line'
        ? 'AI streaming event exceeded the allowed size.'
        : 'AI streaming response exceeded the allowed size.',
    );
    this.name = 'NdjsonOutputLimitError';
  }
}

const makeRequestAbort = (
  request: Request,
  response: Response,
  timeoutMs: number,
): RequestAbort => {
  const controller = new AbortController();
  const abortForClient = () => {
    if (!controller.signal.aborted && !response.writableEnded)
      controller.abort(new ClientAbortError());
  };
  request.once('aborted', abortForClient);
  response.once('close', abortForClient);
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(new AiTimeoutError());
  }, timeoutMs);
  timeout.unref();

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      request.off('aborted', abortForClient);
      response.off('close', abortForClient);
    },
  };
};

const writeNdjson = async (
  response: Response,
  event: unknown,
  signal: AbortSignal,
  budget: NdjsonBudget,
  ignoreAbort = false,
): Promise<void> => {
  if (!ignoreAbort && signal.aborted) throw signal.reason ?? new ClientAbortError();
  if (response.writableEnded || response.destroyed) throw new ClientAbortError();
  const line = `${JSON.stringify(event)}\n`;
  const lineBytes = Buffer.byteLength(line, 'utf8');
  if (lineBytes > NDJSON_MAX_LINE_BYTES) throw new NdjsonOutputLimitError('line');
  if (budget.bytesWritten + lineBytes > NDJSON_MAX_TOTAL_BYTES) {
    throw new NdjsonOutputLimitError('response');
  }
  budget.bytesWritten += lineBytes;
  if (response.write(line)) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      signal.removeEventListener('abort', onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new ClientAbortError());
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new ClientAbortError());
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
    if (!ignoreAbort) signal.addEventListener('abort', onAbort, { once: true });
  });
};

const endResponse = (response: Response): void => {
  if (!response.writableEnded && !response.destroyed) response.end();
};

const parseOrThrow = <T>(
  result:
    | { success: true; data: T }
    | { success: false; error: Parameters<typeof zodValidationError>[0] },
): T => {
  if (!result.success) throw zodValidationError(result.error);
  return result.data;
};

const assertSearchGroundingReleased = (useSearch: boolean): void => {
  if (useSearch && !SEARCH_GROUNDING_RELEASE_ENABLED) {
    throw new SearchGroundingDisabledError();
  }
};

export const createGenerationRouter = (dependencies: GenerationRouteDependencies): Router => {
  const router = Router();
  const limiter = dependencies.limiter ?? aiAdmissionLimiter;
  const galleryTimeout = dependencies.requestTimeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS;
  const postTimeout = dependencies.requestTimeoutMs ?? POST_REQUEST_TIMEOUT_MS;
  const followUpTimeout = dependencies.requestTimeoutMs ?? FOLLOW_UP_REQUEST_TIMEOUT_MS;
  const feedbackTimeout = dependencies.requestTimeoutMs ?? FEEDBACK_REQUEST_TIMEOUT_MS;

  router.post('/gallery/stream', async (request, response) => {
    let streamStarted = false;
    let requestAbort: RequestAbort | undefined;
    const streamBudget: NdjsonBudget = { bytesWritten: 0 };
    try {
      const params = parseOrThrow(createGalleryParamsSchema.safeParse(request.body));
      assertSearchGroundingReleased(params.useSearch);
      dependencies.assertModelAllowed(params.selectedProvider, params.selectedModel);
      const sessionId = dependencies.getSessionId(request);

      await limiter.run(sessionId, async () => {
        requestAbort = makeRequestAbort(request, response, galleryTimeout);
        const client = await raceWithAbort(
          Promise.resolve(dependencies.getClient(sessionId, params.selectedProvider)),
          requestAbort.signal,
        );
        response.status(200);
        response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Accel-Buffering', 'no');
        response.flushHeaders();
        streamStarted = true;

        await raceWithAbort(
          createGallery(
            client,
            params,
            {
              onChunk: text =>
                writeNdjson(response, { type: 'chunk', text }, requestAbort!.signal, streamBudget),
              onPhase: (phase, message, progress) =>
                writeNdjson(
                  response,
                  { type: 'phase', phase, message, progress },
                  requestAbort!.signal,
                  streamBudget,
                ),
              onWarning: warning =>
                writeNdjson(
                  response,
                  { type: 'warning', warning },
                  requestAbort!.signal,
                  streamBudget,
                ),
            },
            requestAbort.signal,
          ).then(result =>
            writeNdjson(
              response,
              { type: 'result', data: result },
              requestAbort!.signal,
              streamBudget,
            ),
          ),
          requestAbort.signal,
        );
      });
      endResponse(response);
    } catch (error) {
      const safe = toPublicError(error);
      if (streamStarted) {
        try {
          if (requestAbort && !requestAbort.signal.aborted) {
            await writeNdjson(
              response,
              {
                type: 'error',
                message: safe.message,
                code: safe.code,
                retryable: safe.retryable,
                requestId: getRequestId(response),
              },
              requestAbort.signal,
              streamBudget,
            );
          } else if (!response.writableEnded && !response.destroyed) {
            // The deadline signal is already aborted, but the browser transport
            // can still receive the terminal protocol event.
            await writeNdjson(
              response,
              {
                type: 'error',
                message: safe.message,
                code: safe.code,
                retryable: safe.retryable,
                requestId: getRequestId(response),
              },
              requestAbort?.signal ?? AbortSignal.abort(),
              streamBudget,
              true,
            );
          }
        } catch {
          // The client is already gone; there is no transport left to notify.
        }
        endResponse(response);
      } else {
        sendPublicError(response, error);
      }
    } finally {
      requestAbort?.dispose();
    }
  });

  router.post('/posts', async (request, response) => {
    let requestAbort: RequestAbort | undefined;
    try {
      const body = parseOrThrow(addUserPostRequestSchema.safeParse(request.body));
      assertSearchGroundingReleased(body.galleryContext.useSearch);
      dependencies.assertModelAllowed(
        body.galleryContext.selectedProvider,
        body.galleryContext.selectedModel,
      );
      const sessionId = dependencies.getSessionId(request);
      const result = await limiter.run(sessionId, async () => {
        requestAbort = makeRequestAbort(request, response, postTimeout);
        const client = await raceWithAbort(
          Promise.resolve(dependencies.getClient(sessionId, body.galleryContext.selectedProvider)),
          requestAbort.signal,
        );
        return raceWithAbort(
          createUserPost(client, body.newPostData, body.galleryContext, requestAbort.signal),
          requestAbort.signal,
        );
      });
      response.json(result);
    } catch (error) {
      sendPublicError(response, error);
    } finally {
      requestAbort?.dispose();
    }
  });

  router.post('/comments/follow-up', async (request, response) => {
    let requestAbort: RequestAbort | undefined;
    try {
      const body = parseOrThrow(followUpCommentsRequestSchema.safeParse(request.body));
      assertSearchGroundingReleased(body.galleryContext.useSearch);
      dependencies.assertModelAllowed(
        body.galleryContext.selectedProvider,
        body.galleryContext.selectedModel,
      );
      const sessionId = dependencies.getSessionId(request);
      const result = await limiter.run(sessionId, async () => {
        requestAbort = makeRequestAbort(request, response, followUpTimeout);
        const client = await raceWithAbort(
          Promise.resolve(dependencies.getClient(sessionId, body.galleryContext.selectedProvider)),
          requestAbort.signal,
        );
        return raceWithAbort(
          createFollowUpComments(
            client,
            body.targetPost,
            body.updatedComments,
            body.galleryContext,
            requestAbort.signal,
          ),
          requestAbort.signal,
        );
      });
      response.json(result);
    } catch (error) {
      sendPublicError(response, error);
    } finally {
      requestAbort?.dispose();
    }
  });

  router.post('/worldview-feedback', async (request, response) => {
    let requestAbort: RequestAbort | undefined;
    try {
      const body = parseOrThrow(worldviewFeedbackRequestSchema.safeParse(request.body));
      const provider = body.selectedProvider ?? 'gemini';
      dependencies.assertModelAllowed(provider, body.selectedModel);
      const sessionId = dependencies.getSessionId(request);
      const feedback = await limiter.run(sessionId, async () => {
        requestAbort = makeRequestAbort(request, response, feedbackTimeout);
        const client = await raceWithAbort(
          Promise.resolve(dependencies.getClient(sessionId, provider)),
          requestAbort.signal,
        );
        return raceWithAbort(
          createWorldviewFeedback(
            client,
            body.customWorldviewText,
            body.galleryData,
            body.selectedModel,
            requestAbort.signal,
          ),
          requestAbort.signal,
        );
      });
      response.json({ feedback });
    } catch (error) {
      sendPublicError(response, error);
    } finally {
      requestAbort?.dispose();
    }
  });

  return router;
};
