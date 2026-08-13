import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createCredentialRouter } from './routes/credentialRoutes';
import { createGenerationRouter } from './routes/generationRoutes';
import { assertModelAllowed, createProviderClient } from './ai/provider';
import { createSessionMiddleware, getSessionId } from './sessionMiddleware';
import { loopbackRequestGuard, securityHeaders, sensitivePathGuard } from './security';
import {
  sessionCredentialStore,
  type SessionCredentialStore,
} from './sessionStore';

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
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(loopbackRequestGuard);
  app.use(securityHeaders);
  app.use(sensitivePathGuard);
  app.use(createSessionMiddleware(store));

  app.use('/api/ai/credentials', express.json({ limit: '64kb' }), createCredentialRouter({ store }));
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api/ai', createGenerationRouter({
    getSessionId,
    getClient: (sessionId, provider) => createProviderClient(sessionId, provider, store),
    assertModelAllowed,
  }));
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' });
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
    app.use(express.static(distPath, {
      index: false,
      setHeaders(response) {
        response.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }));
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
    if (status === 413) {
      response.status(413).json({ error: '요청 본문 크기 제한을 초과했습니다.' });
      return;
    }
    response.status(500).json({ error: '로컬 서버가 요청을 처리하지 못했습니다.' });
  });
  return app;
};
