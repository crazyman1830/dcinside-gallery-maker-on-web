// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { SessionCredentialStore } from '../server/sessionStore';
import { GalleryFormProvider } from '../context/GalleryFormContext';
import { AdvancedOptionsSection } from '../components/AdvancedOptionsSection';

vi.mock('../components/AiConnectionSettings', () => ({
  AiConnectionSettings: () => null,
}));

afterEach(cleanup);

describe('Google Search grounding display boundary', () => {
  it('keeps the production CSP hardened while Search grounding is release-disabled', async () => {
    const app = await createApp({
      mode: 'production',
      serveFrontend: false,
      store: new SessionCredentialStore(),
    });
    const response = await request(app).get('/healthz').set('Host', '127.0.0.1:8787').expect(200);
    const policy = String(response.headers['content-security-policy']);

    // Search grounding has no active renderer in this release. Preserve the
    // existing style baseline without opening script execution or connections.
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("object-src 'none'");
  });

  it('keeps Search grounding disabled with an accessible release-policy explanation', () => {
    render(
      React.createElement(
        GalleryFormProvider,
        null,
        React.createElement(AdvancedOptionsSection, {
          selectedModel: 'gemini-3.5-flash',
          onSelectedModelChange: vi.fn(),
          isSearchEnabled: true,
          onSearchEnabledChange: vi.fn(),
          credentialStatus: null,
          isCheckingCredentials: false,
          onCredentialStatusChange: vi.fn(),
        }),
      ),
    );

    const searchToggle = screen.getByRole('checkbox', { name: '실시간 웹 검색 반영' });
    expect(searchToggle).toBeDisabled();
    expect(searchToggle).not.toBeChecked();
    expect(searchToggle).toHaveAccessibleDescription(
      '공식 표시·저장 조건을 충족하는 전용 흐름을 준비 중입니다.',
    );
  });
});
