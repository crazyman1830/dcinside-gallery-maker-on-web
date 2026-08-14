import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiSessionBusyError } from '../server/ai/admission';
import {
  AiTimeoutError,
  ClientAbortError,
  raceWithAbort,
  requestIdMiddleware,
  RequestValidationError,
  sendPublicError,
  toPublicError,
} from '../server/http';

describe('public HTTP errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('maps provider and request failures without exposing the original error', () => {
    const cases: Array<[unknown, number, string, boolean]> = [
      [new AiTimeoutError(), 504, 'AI_TIMEOUT', true],
      [new ClientAbortError(), 499, 'CLIENT_ABORTED', false],
      [new DOMException('aborted', 'AbortError'), 499, 'CLIENT_ABORTED', false],
      [new RequestValidationError('invalid', 'topic'), 400, 'INVALID_REQUEST', false],
      [Object.assign(new Error('bad request'), { status: 400 }), 400, 'INVALID_REQUEST', false],
      [Object.assign(new Error('unauthorized'), { status: 401 }), 401, 'AI_UNAUTHORIZED', false],
      [Object.assign(new Error('forbidden'), { status: 403 }), 403, 'AI_FORBIDDEN', false],
      [Object.assign(new Error('missing'), { status: 404 }), 404, 'AI_MODEL_NOT_FOUND', false],
      [new AiSessionBusyError(), 429, 'AI_SESSION_BUSY', true],
      [Object.assign(new Error('too large'), { status: 413 }), 413, 'PAYLOAD_TOO_LARGE', false],
      [
        Object.assign(new Error('provider capacity'), {
          status: 503,
          code: 'AI_PROVIDER_CAPACITY',
          retryable: true,
        }),
        503,
        'AI_PROVIDER_CAPACITY',
        true,
      ],
      [Object.assign(new Error('HTTP 503'), { code: 'UPSTREAM_DOWN' }), 502, 'UPSTREAM_DOWN', true],
      [Object.assign(new Error('gateway timeout'), { statusCode: 504 }), 504, 'AI_TIMEOUT', true],
      [new Error('unexpected'), 500, 'INTERNAL_ERROR', false],
    ];

    for (const [error, status, code, retryable] of cases) {
      expect(toPublicError(error)).toMatchObject({ status, code, retryable });
    }
  });

  it('preserves safe API not-found messages and bounds retry metadata', () => {
    expect(
      toPublicError(
        Object.assign(new Error('custom route missing'), {
          status: 404,
          code: 'API_NOT_FOUND',
        }),
      ),
    ).toMatchObject({ message: 'custom route missing', code: 'API_NOT_FOUND' });

    expect(
      toPublicError(
        Object.assign(new Error('busy'), {
          status: 429,
          code: 'AI_CAPACITY',
          retryable: false,
          retryAfterSeconds: 999,
        }),
      ),
    ).toMatchObject({
      status: 429,
      code: 'AI_CAPACITY',
      retryable: false,
      retryAfterSeconds: 60,
    });
  });

  it('sends a structured response and only logs redacted diagnostics', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/error', (_request, response) => {
      sendPublicError(
        response,
        Object.assign(new Error('credential secret raw prompt'), {
          status: 429,
          code: 'AI_CAPACITY',
          retryAfterSeconds: 2,
        }),
      );
    });

    const response = await request(app).get('/error').expect(429);
    expect(response.headers['retry-after']).toBe('2');
    expect(response.body).toMatchObject({
      code: 'AI_CAPACITY',
      retryable: true,
      requestId: response.headers['x-request-id'],
    });
    expect(log).toHaveBeenCalledOnce();
    const diagnostic = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(diagnostic)).toEqual({
      level: 'error',
      event: 'request_error',
      requestId: response.headers['x-request-id'],
      code: 'AI_CAPACITY',
      status: 429,
      retryable: true,
    });
    expect(diagnostic).not.toContain('credential secret raw prompt');
  });
});

describe('abort races', () => {
  it('rejects immediately for both pre-aborted and subsequently aborted signals', async () => {
    const preAborted = new AbortController();
    const firstReason = new Error('already aborted');
    preAborted.abort(firstReason);
    await expect(raceWithAbort(Promise.resolve('late'), preAborted.signal)).rejects.toBe(
      firstReason,
    );

    const controller = new AbortController();
    const pending = raceWithAbort(new Promise<never>(() => undefined), controller.signal);
    const secondReason = new Error('cancelled');
    controller.abort(secondReason);
    await expect(pending).rejects.toBe(secondReason);
  });
});
