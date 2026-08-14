import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AiProvider } from '../../types';
import { parseServiceAccountCredential, validateGoogleProjectId } from '../credentials';
import {
  assertModelAllowed,
  createProviderClient,
  EVALUATION_MODEL,
  getDefaultModel,
} from '../ai/provider';
import { sessionCredentialStore, type SessionCredentialStore } from '../sessionStore';
import { getSessionId } from '../sessionMiddleware';
import { withProviderRetry } from '../ai/generation';
import { aiAdmissionLimiter, type AiAdmissionLimiter } from '../ai/admission';
import {
  AiTimeoutError,
  ClientAbortError,
  raceWithAbort,
  sendPublicError,
  zodValidationError,
} from '../http';

const CONNECTION_TEST_TIMEOUT_MS = 30_000;

interface CredentialRouterOptions {
  store?: SessionCredentialStore;
  sessionId?: (request: Request) => string;
  limiter?: Pick<AiAdmissionLimiter, 'run'>;
  connectionTestTimeoutMs?: number;
  allowVertexAdc?: boolean;
}

const isProvider = (value: string): value is AiProvider => value === 'gemini' || value === 'vertex';

const geminiCredentialSchema = z.object({ apiKey: z.string().trim().min(1).max(16_384) }).strict();
const serviceAccountSchema = z.object({ credentials: z.unknown() }).strict();
const adcSchema = z.object({ projectId: z.string().trim().max(30).optional() }).strict();
const credentialTestSchema = z
  .object({ model: z.string().trim().min(1).max(100).optional() })
  .strict();

export const createCredentialRouter = ({
  store = sessionCredentialStore,
  sessionId = getSessionId,
  limiter = aiAdmissionLimiter,
  connectionTestTimeoutMs = CONNECTION_TEST_TIMEOUT_MS,
  allowVertexAdc = process.env.DCGM_ENABLE_VERTEX_ADC === '1',
}: CredentialRouterOptions = {}): Router => {
  const router = Router();

  const getCredentialStatus = (id: string) => ({
    ...store.status(id),
    capabilities: { vertexAdc: allowVertexAdc },
  });

  router.get('/', (request, response) => {
    response.json(getCredentialStatus(sessionId(request)));
  });

  router.post('/gemini', (request, response) => {
    try {
      const parsed = geminiCredentialSchema.safeParse(request.body);
      if (!parsed.success) throw zodValidationError(parsed.error);
      const id = sessionId(request);
      store.setGemini(id, parsed.data.apiKey);
      response.status(201).json(getCredentialStatus(id));
    } catch (error) {
      sendPublicError(response, error);
    }
  });

  router.post('/vertex/service-account', (request, response) => {
    try {
      const parsed = serviceAccountSchema.safeParse(request.body);
      if (!parsed.success) throw zodValidationError(parsed.error);
      const credentials = parseServiceAccountCredential(parsed.data.credentials);
      const id = sessionId(request);
      store.setVertex(id, {
        authMode: 'service_account',
        projectId: credentials.project_id,
        location: 'global',
        credentials,
      });
      response.status(201).json(getCredentialStatus(id));
    } catch (error) {
      sendPublicError(
        response,
        Object.assign(new Error('서비스 계정 JSON이 올바르지 않습니다.'), {
          status: 400,
          code: 'INVALID_SERVICE_ACCOUNT',
        }),
      );
    }
  });

  router.post('/vertex/adc', (request, response) => {
    if (!allowVertexAdc) {
      sendPublicError(
        response,
        Object.assign(
          new Error(
            '서버의 Application Default Credentials 사용이 비활성화되어 있습니다. DCGM_ENABLE_VERTEX_ADC=1로 명시적으로 활성화해주세요.',
          ),
          { status: 403, code: 'ADC_DISABLED', retryable: false },
        ),
      );
      return;
    }
    try {
      const parsed = adcSchema.safeParse(request.body);
      if (!parsed.success) throw zodValidationError(parsed.error);
      const projectId = validateGoogleProjectId(
        parsed.data.projectId || process.env.GOOGLE_CLOUD_PROJECT || '',
      );
      const id = sessionId(request);
      store.setVertex(id, {
        authMode: 'adc',
        projectId,
        location: 'global',
      });
      response.status(201).json(getCredentialStatus(id));
    } catch (error) {
      sendPublicError(
        response,
        Object.assign(
          new Error(
            '프로젝트 ID를 입력하거나 올바른 GOOGLE_CLOUD_PROJECT 환경 변수를 설정해 주세요.',
          ),
          { status: 400, code: 'INVALID_PROJECT_ID' },
        ),
      );
    }
  });

  router.delete('/:provider', (request, response) => {
    if (!isProvider(request.params.provider)) {
      sendPublicError(
        response,
        Object.assign(new Error('지원하지 않는 AI 공급자입니다.'), {
          status: 404,
          code: 'AI_PROVIDER_NOT_FOUND',
        }),
      );
      return;
    }
    store.deleteProvider(sessionId(request), request.params.provider);
    response.status(204).end();
  });

  router.post('/:provider/test', async (request, response) => {
    const provider = request.params.provider;
    if (!isProvider(provider)) {
      sendPublicError(
        response,
        Object.assign(new Error('지원하지 않는 AI 공급자입니다.'), {
          status: 404,
          code: 'AI_PROVIDER_NOT_FOUND',
        }),
      );
      return;
    }
    try {
      const parsed = credentialTestSchema.safeParse(request.body);
      if (!parsed.success) throw zodValidationError(parsed.error);
      const model = parsed.data.model ?? getDefaultModel(provider);
      assertModelAllowed(provider, model);
      const id = sessionId(request);
      await limiter.run(id, async () => {
        const client = createProviderClient(id, provider, store);
        const controller = new AbortController();
        const abortForClient = () => controller.abort(new ClientAbortError());
        request.once('aborted', abortForClient);
        response.once('close', abortForClient);
        const timeout = setTimeout(
          () => controller.abort(new AiTimeoutError()),
          connectionTestTimeoutMs,
        );
        timeout.unref();
        try {
          const models = [...new Set([model, EVALUATION_MODEL[provider]])];
          for (const candidate of models) {
            await raceWithAbort(
              withProviderRetry(
                () =>
                  client.models.generateContent({
                    model: candidate,
                    contents: 'Reply with exactly OK.',
                    config: { maxOutputTokens: 8, abortSignal: controller.signal },
                  }),
                { signal: controller.signal },
              ),
              controller.signal,
            );
          }
        } finally {
          clearTimeout(timeout);
          request.off('aborted', abortForClient);
          response.off('close', abortForClient);
        }
      });
      response.json({ ok: true });
    } catch (error) {
      sendPublicError(response, error);
    }
  });

  return router;
};
