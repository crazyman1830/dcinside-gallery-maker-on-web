import type { ServiceAccountCredential } from './sessionStore';
import { createPrivateKey } from 'node:crypto';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (value: Record<string, unknown>, key: string): string => {
  const field = value[key];
  if (typeof field !== 'string' || !field.trim()) {
    throw new Error('서비스 계정 JSON의 필수 필드가 올바르지 않습니다.');
  }
  return field;
};

export const validateGoogleProjectId = (projectId: string): string => {
  const restrictedStrings = ['google', 'ssl', 'null', 'undefined'];
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
    restrictedStrings.some(restricted => projectId.includes(restricted))
  ) {
    throw new Error('Google Cloud 프로젝트 ID가 올바르지 않습니다.');
  }
  return projectId;
};

export const parseServiceAccountCredential = (input: unknown): ServiceAccountCredential => {
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      throw new Error('서비스 계정 JSON 형식이 올바르지 않습니다.');
    }
  }
  if (!isRecord(parsed) || parsed.type !== 'service_account') {
    throw new Error('서비스 계정 JSON 형식이 올바르지 않습니다.');
  }

  const projectId = requiredString(parsed, 'project_id');
  const clientEmail = requiredString(parsed, 'client_email');
  const privateKey = requiredString(parsed, 'private_key');
  const tokenUri = requiredString(parsed, 'token_uri');
  validateGoogleProjectId(projectId);
  if (clientEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(clientEmail)) {
    throw new Error('서비스 계정 JSON의 필수 필드가 올바르지 않습니다.');
  }
  try {
    const key = createPrivateKey({ key: privateKey, format: 'pem' });
    if (key.type !== 'private' || key.asymmetricKeyType !== 'rsa')
      throw new Error('Not an RSA key.');
  } catch {
    throw new Error('서비스 계정 JSON의 비공개 키가 올바르지 않습니다.');
  }
  let tokenUrl: URL;
  try {
    tokenUrl = new URL(tokenUri);
  } catch {
    throw new Error('서비스 계정 JSON의 필수 필드가 올바르지 않습니다.');
  }
  if (
    tokenUrl.protocol !== 'https:' ||
    tokenUrl.hostname !== 'oauth2.googleapis.com' ||
    tokenUrl.port ||
    tokenUrl.username ||
    tokenUrl.password ||
    tokenUrl.pathname !== '/token' ||
    tokenUrl.search ||
    tokenUrl.hash
  ) {
    throw new Error('서비스 계정 JSON의 토큰 주소가 허용되지 않습니다.');
  }

  // Explicitly construct a new object so private_key_id, client_id, custom
  // endpoints, and all other untrusted fields never reach GoogleAuth.
  return {
    type: 'service_account',
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: 'https://oauth2.googleapis.com/token',
  };
};
