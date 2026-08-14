import { AiProvider, VertexAuthMode } from '../types';
import { readApiError } from './apiError';

export interface ProviderCredentialStatus {
  configured: boolean;
}

export interface VertexCredentialStatus extends ProviderCredentialStatus {
  authMode?: VertexAuthMode;
  projectId?: string;
  location?: string;
}

export interface AiCredentialStatus {
  providers: {
    gemini: ProviderCredentialStatus;
    vertex: VertexCredentialStatus;
  };
  capabilities?: {
    vertexAdc: boolean;
  };
}

type JsonRecord = Record<string, unknown>;

const CREDENTIALS_ENDPOINT = '/api/ai/credentials';

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getOptionalString = (record: JsonRecord, key: string): string | undefined =>
  typeof record[key] === 'string' && record[key] ? record[key] : undefined;

const normalizeStatus = (value: unknown): AiCredentialStatus => {
  const root = isRecord(value) ? value : {};
  const providers = isRecord(root.providers) ? root.providers : {};
  const capabilities = isRecord(root.capabilities) ? root.capabilities : {};
  const gemini = isRecord(providers.gemini) ? providers.gemini : {};
  const vertex = isRecord(providers.vertex) ? providers.vertex : {};
  const rawAuthMode = getOptionalString(vertex, 'authMode');
  const authMode: VertexAuthMode | undefined =
    rawAuthMode === 'service_account' || rawAuthMode === 'adc' ? rawAuthMode : undefined;

  return {
    providers: {
      gemini: { configured: gemini.configured === true },
      vertex: {
        configured: vertex.configured === true,
        authMode,
        projectId: getOptionalString(vertex, 'projectId'),
        location: getOptionalString(vertex, 'location'),
      },
    },
    ...(typeof capabilities.vertexAdc === 'boolean'
      ? { capabilities: { vertexAdc: capabilities.vertexAdc } }
      : {}),
  };
};

const request = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await readApiError(response, '자격증명 요청에 실패했습니다.');
  }

  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : undefined;
};

export const getAiCredentialStatus = async (): Promise<AiCredentialStatus> =>
  normalizeStatus(await request(CREDENTIALS_ENDPOINT));

export const registerGeminiCredential = async (apiKey: string): Promise<void> => {
  await request(`${CREDENTIALS_ENDPOINT}/gemini`, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
};

export const registerVertexServiceAccount = async (credentials: string): Promise<void> => {
  let parsedCredentials: unknown;
  try {
    parsedCredentials = JSON.parse(credentials);
  } catch {
    throw new Error('서비스 계정 JSON 형식을 확인해주세요.');
  }

  if (!isRecord(parsedCredentials)) {
    throw new Error('서비스 계정 자격증명은 JSON 객체여야 합니다.');
  }

  await request(`${CREDENTIALS_ENDPOINT}/vertex/service-account`, {
    method: 'POST',
    body: JSON.stringify({ credentials: parsedCredentials }),
  });
};

export const registerVertexAdc = async (projectId: string): Promise<void> => {
  await request(`${CREDENTIALS_ENDPOINT}/vertex/adc`, {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
};

export const deleteAiCredential = async (provider: AiProvider): Promise<void> => {
  await request(`${CREDENTIALS_ENDPOINT}/${provider}`, { method: 'DELETE' });
};

export const testAiCredential = async (provider: AiProvider, model?: string): Promise<void> => {
  await request(`${CREDENTIALS_ENDPOINT}/${provider}/test`, {
    method: 'POST',
    body: JSON.stringify(model ? { model } : {}),
  });
};
