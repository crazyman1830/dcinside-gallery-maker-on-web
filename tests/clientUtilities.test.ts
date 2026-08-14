// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAiCredential,
  getAiCredentialStatus,
  registerGeminiCredential,
  registerVertexAdc,
  registerVertexServiceAccount,
  testAiCredential,
} from '../services/aiCredentialClient';
import { useUIState } from '../hooks/useUIState';
import { useVoting } from '../hooks/useVoting';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('AI credential client', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes incomplete status responses safely', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        providers: {
          gemini: { configured: true },
          vertex: {
            configured: true,
            authMode: 'adc',
            projectId: 'valid-project',
            location: 'global',
          },
        },
      }),
    );
    await expect(getAiCredentialStatus()).resolves.toEqual({
      providers: {
        gemini: { configured: true },
        vertex: {
          configured: true,
          authMode: 'adc',
          projectId: 'valid-project',
          location: 'global',
        },
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ providers: { vertex: { authMode: 'other' } } }),
    );
    await expect(getAiCredentialStatus()).resolves.toEqual({
      providers: {
        gemini: { configured: false },
        vertex: {
          configured: false,
          authMode: undefined,
          projectId: undefined,
          location: undefined,
        },
      },
    });
  });

  it('sends every credential mutation with the expected method and body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await registerGeminiCredential('secret');
    await registerVertexAdc('valid-project');
    await registerVertexServiceAccount('{"type":"service_account"}');
    await testAiCredential('gemini', 'gemini-3.5-flash');
    await testAiCredential('vertex');
    await deleteAiCredential('gemini');

    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      1,
      '/api/ai/credentials/gemini',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ apiKey: 'secret' }),
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      '/api/ai/credentials/vertex/adc',
      expect.objectContaining({
        body: JSON.stringify({ projectId: 'valid-project' }),
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      4,
      '/api/ai/credentials/gemini/test',
      expect.objectContaining({
        body: JSON.stringify({ model: 'gemini-3.5-flash' }),
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      5,
      '/api/ai/credentials/vertex/test',
      expect.objectContaining({
        body: '{}',
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      6,
      '/api/ai/credentials/gemini',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('rejects malformed service account input before fetch', async () => {
    await expect(registerVertexServiceAccount('{bad')).rejects.toThrow(/JSON 형식/);
    await expect(registerVertexServiceAccount('[]')).rejects.toThrow(/JSON 객체/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses a safe server error and status fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: '연결 거부' }, 403));
    await expect(registerGeminiCredential('bad')).rejects.toThrow('연결 거부');

    vi.mocked(fetch).mockResolvedValueOnce(new Response('not json', { status: 500 }));
    await expect(registerGeminiCredential('bad')).rejects.toThrow('HTTP 500');
  });
});

describe('useUIState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resets generation state, controls modal, and clears transient messages', () => {
    const { result, unmount } = renderHook(() => useUIState());
    act(() => {
      result.current.setError('error');
      result.current.setWarningMessage('warning');
      result.current.setSuccessMessage('done');
      result.current.setWorldviewFeedback('feedback');
      result.current.openWriteModal();
    });
    expect(result.current.isWriteModalOpen).toBe(true);

    act(() => result.current.resetForNewGeneration());
    expect(result.current).toMatchObject({
      isLoading: true,
      error: null,
      successMessage: null,
      warningMessage: null,
      streamingText: '',
      generationPhase: 'connecting',
      generationProgress: null,
      worldviewFeedback: null,
    });

    act(() => result.current.setSuccessMessage('temporary'));
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.successMessage).toBeNull();

    act(() => result.current.triggerCommentHighlight(new Set(['a', 'b'])));
    expect(result.current.highlightedCommentIds).toEqual(new Set(['a', 'b']));
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.highlightedCommentIds.size).toBe(0);

    act(() => result.current.closeWriteModal());
    expect(result.current.isWriteModalOpen).toBe(false);
    unmount();
  });
});

describe('useVoting', () => {
  it('supports create, cancel and switching both vote directions', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ recs, nonRecs, voted }) => useVoting(recs, nonRecs, voted, onChange),
      { initialProps: { recs: 10, nonRecs: 2, voted: null as 'rec' | 'nonrec' | null } },
    );

    act(() => result.current.handleRecommend());
    expect(result.current).toMatchObject({ recs: 11, nonRecs: 2, voted: 'rec' });
    act(() => result.current.handleRecommend());
    expect(result.current).toMatchObject({ recs: 10, nonRecs: 2, voted: null });
    act(() => result.current.handleNonRecommend());
    expect(result.current).toMatchObject({ recs: 10, nonRecs: 3, voted: 'nonrec' });
    act(() => result.current.handleRecommend());
    expect(result.current).toMatchObject({ recs: 11, nonRecs: 2, voted: 'rec' });
    act(() => result.current.handleNonRecommend());
    expect(result.current).toMatchObject({ recs: 10, nonRecs: 3, voted: 'nonrec' });
    act(() => result.current.handleNonRecommend());
    expect(result.current).toMatchObject({ recs: 10, nonRecs: 2, voted: null });

    rerender({ recs: 100, nonRecs: 50, voted: 'rec' });
    expect(result.current).toMatchObject({ recs: 100, nonRecs: 50, voted: 'rec' });
    expect(onChange).toHaveBeenCalledTimes(6);
  });
});
