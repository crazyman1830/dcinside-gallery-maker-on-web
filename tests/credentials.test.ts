import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { parseServiceAccountCredential } from '../server/credentials';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1_024 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const validCredential = {
  type: 'service_account',
  project_id: 'sample-project-123',
  client_email: 'local-test@sample-project-123.iam.gserviceaccount.com',
  private_key: privateKeyPem,
  token_uri: 'https://oauth2.googleapis.com/token',
};

describe('service account credential parser', () => {
  it('accepts an object and forwards only explicitly allowed fields', () => {
    const parsed = parseServiceAccountCredential({
      ...validCredential,
      private_key_id: 'must-not-be-forwarded',
      client_id: 'must-not-be-forwarded',
      custom_endpoint: 'https://example.invalid/',
    });

    expect(parsed).toEqual(validCredential);
    expect(parsed).not.toHaveProperty('private_key_id');
    expect(parsed).not.toHaveProperty('client_id');
    expect(parsed).not.toHaveProperty('custom_endpoint');
  });

  it('accepts the same credential as a JSON string', () => {
    expect(parseServiceAccountCredential(JSON.stringify(validCredential))).toEqual(validCredential);
  });

  it('rejects malformed or unsafe credentials', () => {
    const invalidCredentials: unknown[] = [
      null,
      [],
      { ...validCredential, type: 'authorized_user' },
      { ...validCredential, project_id: '' },
      { ...validCredential, project_id: 'abcde' },
      { ...validCredential, project_id: 'Uppercase-project' },
      { ...validCredential, project_id: 'project-' },
      { ...validCredential, project_id: `p${'a'.repeat(30)}` },
      { ...validCredential, project_id: 'my-google-project' },
      { ...validCredential, project_id: 'ssl-project' },
      { ...validCredential, project_id: 'null-project' },
      { ...validCredential, project_id: 'undefined-project' },
      { ...validCredential, client_email: 'not-an-email' },
      { ...validCredential, private_key: 'not-a-private-key' },
      { ...validCredential, token_uri: 'http://oauth2.googleapis.com/token' },
      { ...validCredential, token_uri: 'https://example.invalid/token' },
      { ...validCredential, token_uri: 'https://oauth2.googleapis.com:444/token' },
      { ...validCredential, token_uri: 'https://oauth2.googleapis.com/token?redirect=1' },
      '{not json}',
    ];

    for (const value of invalidCredentials) {
      expect(() => parseServiceAccountCredential(value)).toThrow();
    }
  });
});
