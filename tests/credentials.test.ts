import { describe, expect, it } from 'vitest';
import { parseServiceAccountCredential } from '../server/credentials';

const validCredential = {
  type: 'service_account',
  project_id: 'sample-project-123',
  client_email: 'local-test@sample-project-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nTEST-ONLY\n-----END PRIVATE KEY-----\n',
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
    expect(parseServiceAccountCredential(JSON.stringify(validCredential)))
      .toEqual(validCredential);
  });

  it.each([
    null,
    [],
    { ...validCredential, type: 'authorized_user' },
    { ...validCredential, project_id: '' },
    { ...validCredential, client_email: 'not-an-email' },
    { ...validCredential, private_key: 'not-a-private-key' },
    { ...validCredential, token_uri: 'http://oauth2.googleapis.com/token' },
    { ...validCredential, token_uri: 'https://example.invalid/token' },
    '{not json}',
  ])('rejects malformed or unsafe credentials', value => {
    expect(() => parseServiceAccountCredential(value)).toThrow();
  });
});
