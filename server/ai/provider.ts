import { GoogleGenAI } from '@google/genai';
import type { AiProvider } from '../../types';
import {
  AI_MODELS,
  DEFAULT_MODEL_BY_PROVIDER,
  EVALUATION_MODEL_BY_PROVIDER,
} from '../../constants';
import {
  sessionCredentialStore,
  type SessionCredentialStore,
} from '../sessionStore';

export const MODEL_ALLOWLIST: Record<AiProvider, readonly string[]> = {
  gemini: AI_MODELS.gemini.map(model => model.value),
  vertex: AI_MODELS.vertex.map(model => model.value),
};

export const EVALUATION_MODEL = EVALUATION_MODEL_BY_PROVIDER;

export const assertModelAllowed = (provider: AiProvider, model: string): void => {
  if (!MODEL_ALLOWLIST[provider]?.includes(model)) {
    throw new Error('지원하지 않는 모델입니다.');
  }
};

export const getDefaultModel = (provider: AiProvider): string => DEFAULT_MODEL_BY_PROVIDER[provider];

export const createProviderClient = (
  sessionId: string,
  provider: AiProvider,
  store: SessionCredentialStore = sessionCredentialStore,
): GoogleGenAI => {
  const session = store.get(sessionId);
  if (!session) throw new Error('로컬 세션이 만료되었습니다. 페이지를 새로고침해 주세요.');

  if (provider === 'gemini') {
    if (!session.gemini) {
      throw new Error('선택한 AI 공급자의 자격 증명이 등록되지 않았습니다.');
    }
    return new GoogleGenAI({ apiKey: session.gemini.apiKey });
  }
  if (provider !== 'vertex') throw new Error('지원하지 않는 AI 공급자입니다.');
  if (!session.vertex) {
    throw new Error('선택한 AI 공급자의 자격 증명이 등록되지 않았습니다.');
  }

  if (session.vertex.authMode === 'service_account') {
    return new GoogleGenAI({
      vertexai: true,
      project: session.vertex.projectId,
      location: session.vertex.location,
      googleAuthOptions: { credentials: { ...session.vertex.credentials } },
    });
  }
  return new GoogleGenAI({
    vertexai: true,
    project: session.vertex.projectId,
    location: session.vertex.location,
  });
};

export const getProviderClient = createProviderClient;
