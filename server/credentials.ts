import type { ServiceAccountCredential } from './sessionStore';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const requiredString = (value: Record<string, unknown>, key: string): string => {
  const field = value[key];
  if (typeof field !== 'string' || !field.trim()) {
    throw new Error('서비스 계정 JSON의 필수 필드가 올바르지 않습니다.');
  }
  return field;
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
  if (!/^[a-z][a-z0-9-]{4,62}$/i.test(projectId)
    || !clientEmail.includes('@')
    || !privateKey.includes('BEGIN PRIVATE KEY')
    || !privateKey.includes('END PRIVATE KEY')) {
    throw new Error('서비스 계정 JSON의 필수 필드가 올바르지 않습니다.');
  }
  let tokenUrl: URL;
  try {
    tokenUrl = new URL(tokenUri);
  } catch {
    throw new Error('서비스 계정 JSON의 필수 필드가 올바르지 않습니다.');
  }
  if (tokenUrl.protocol !== 'https:' || tokenUrl.hostname !== 'oauth2.googleapis.com') {
    throw new Error('서비스 계정 JSON의 토큰 주소가 허용되지 않습니다.');
  }

  // Explicitly construct a new object so private_key_id, client_id, custom
  // endpoints, and all other untrusted fields never reach GoogleAuth.
  return {
    type: 'service_account',
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: tokenUrl.toString(),
  };
};
