import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createCredentialRouter } from './routes/credentialRoutes';
import { createGenerationRouter } from './routes/generationRoutes';
import { assertModelAllowed, createProviderClient } from './ai/provider';
import { createSessionMiddleware, getSessionId } from './sessionMiddleware';
import { createSecurityHeaders, loopbackRequestGuard, sensitivePathGuard } from './security';
import { getRequestId, requestIdMiddleware, RequestValidationError, sendPublicError } from './http';
import { sessionCredentialStore, type SessionCredentialStore } from './sessionStore';

export interface CreateAppOptions {
  mode?: 'development' | 'production' | 'test';
  serveFrontend?: boolean;
  store?: SessionCredentialStore;
}

export const createApp = async ({
  mode = process.env.NODE_ENV === 'production' ? 'production' : 'development',
  serveFrontend = true,
  store = sessionCredentialStore,
}: CreateAppOptions = {}): Promise<Express> => {
  if (mode === 'test') process.env.NODE_ENV ??= 'test';
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(loopbackRequestGuard);
  app.use(createSecurityHeaders(mode === 'development'));
  app.use(sensitivePathGuard);
  app.use(requestIdMiddleware);
  if (mode !== 'test') {
    app.use((request, response, next) => {
      const startedAt = performance.now();
      response.once('finish', () => {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'http_request',
            requestId: getRequestId(response),
            method: request.method,
            path: request.path,
            status: response.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
          }),
        );
      });
      next();
    });
  }

  app.get('/healthz', (_request, response) => {
    response.json({ ok: true });
  });

  const sessionMiddleware = createSessionMiddleware(store);
  app.use(
    '/api/ai/credentials',
    sessionMiddleware,
    express.json({ limit: '64kb' }),
    createCredentialRouter({ store }),
  );
  app.use('/api/ai/gallery/stream', sessionMiddleware, express.json({ limit: '16kb' }));
  app.use('/api/ai/posts', sessionMiddleware, express.json({ limit: '32kb' }));
  app.use('/api/ai/comments/follow-up', sessionMiddleware, express.json({ limit: '128kb' }));
  app.use('/api/ai/worldview-feedback', sessionMiddleware, express.json({ limit: '256kb' }));
  app.use(
    '/api/ai',
    createGenerationRouter({
      getSessionId,
      getClient: (sessionId, provider) => createProviderClient(sessionId, provider, store),
      assertModelAllowed,
    }),
  );
  app.use('/api', (_request, response) => {
    sendPublicError(
      response,
      Object.assign(new Error('API 경로를 찾을 수 없습니다.'), {
        status: 404,
        code: 'API_NOT_FOUND',
      }),
    );
  });

  if (serveFrontend && mode === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (serveFrontend && mode === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders(response) {
          response.setHeader('Cache-Control', 'public, max-age=3600');
        },
      }),
    );
    app.use((request, response, next) => {
      if (request.method !== 'GET' || !request.accepts('html')) {
        next();
        return;
      }
      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const status = (error as { status?: number })?.status;
    if (status === 400) {
      sendPublicError(response, new RequestValidationError('요청 JSON 형식이 올바르지 않습니다.'));
      return;
    }
    sendPublicError(response, error);
  });
  return app;
};
