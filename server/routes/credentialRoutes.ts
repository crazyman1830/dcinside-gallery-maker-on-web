import { Router, type Request } from 'express';
import type { AiProvider } from '../../types';
import { parseServiceAccountCredential } from '../credentials';
import {
  assertModelAllowed,
  createProviderClient,
  getDefaultModel,
} from '../ai/provider';
import {
  sessionCredentialStore,
  type SessionCredentialStore,
} from '../sessionStore';
import { getSessionId } from '../sessionMiddleware';
import { withProviderRetry } from '../ai/generation';
import { publicError } from './generationRoutes';

const CONNECTION_TEST_TIMEOUT_MS = 30_000;

interface CredentialRouterOptions {
  store?: SessionCredentialStore;
  sessionId?: (request: Request) => string;
}

const isProvider = (value: string): value is AiProvider => (
  value === 'gemini' || value === 'vertex'
);

const validateProjectId = (projectId: string): string => {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) {
    throw new Error('Google Cloud 프로젝트 ID가 올바르지 않습니다.');
  }
  return projectId;
};

export const createCredentialRouter = ({
  store = sessionCredentialStore,
  sessionId = getSessionId,
}: CredentialRouterOptions = {}): Router => {
  const router = Router();

  router.get('/', (request, response) => {
    response.json(store.status(sessionId(request)));
  });

  router.post('/gemini', (request, response) => {
    try {
      const apiKey = typeof request.body?.apiKey === 'string' ? request.body.apiKey.trim() : '';
      if (!apiKey || apiKey.length > 16_384) throw new Error('Gemini API 키가 올바르지 않습니다.');
      store.setGemini(sessionId(request), apiKey);
      response.status(201).json(store.status(sessionId(request)));
    } catch (error) {
      const safe = publicError(error);
      response.status(safe.status).json({ error: safe.status === 500 ? '자격증명을 등록할 수 없습니다.' : safe.message });
    }
  });

  router.post('/vertex/service-account', (request, response) => {
    try {
      const credentials = parseServiceAccountCredential(request.body?.credentials);
      store.setVertex(sessionId(request), {
        authMode: 'service_account',
        projectId: credentials.project_id,
        location: 'global',
        credentials,
      });
      response.status(201).json(store.status(sessionId(request)));
    } catch {
      response.status(400).json({ error: '서비스 계정 JSON이 올바르지 않습니다.' });
    }
  });

  router.post('/vertex/adc', (request, response) => {
    try {
      const requestedProject = typeof request.body?.projectId === 'string'
        ? request.body.projectId.trim()
        : '';
      const projectId = validateProjectId(requestedProject || process.env.GOOGLE_CLOUD_PROJECT || '');
      store.setVertex(sessionId(request), {
        authMode: 'adc',
        projectId,
        location: 'global',
      });
      response.status(201).json(store.status(sessionId(request)));
    } catch {
      response.status(400).json({
        error: '프로젝트 ID를 입력하거나 GOOGLE_CLOUD_PROJECT 환경 변수를 설정해 주세요.',
      });
    }
  });

  router.delete('/:provider', (request, response) => {
    if (!isProvider(request.params.provider)) {
      response.status(404).json({ error: '지원하지 않는 AI 공급자입니다.' });
      return;
    }
    store.deleteProvider(sessionId(request), request.params.provider);
    response.status(204).end();
  });

  router.post('/:provider/test', async (request, response) => {
    const provider = request.params.provider;
    if (!isProvider(provider)) {
      response.status(404).json({ error: '지원하지 않는 AI 공급자입니다.' });
      return;
    }
    try {
      const model = typeof request.body?.model === 'string'
        ? request.body.model
        : getDefaultModel(provider);
      assertModelAllowed(provider, model);
      const client = createProviderClient(sessionId(request), provider, store);
      const abortSignal = AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS);
      await withProviderRetry(() => client.models.generateContent({
        model,
        contents: 'Reply with exactly OK.',
        config: { maxOutputTokens: 8, abortSignal },
      }));
      response.json({ ok: true });
    } catch (error) {
      const safe = publicError(error);
      response.status(safe.status).json({ error: safe.message });
    }
  });

  return router;
};
