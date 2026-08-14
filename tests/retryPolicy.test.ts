import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRetryableProviderError, withProviderRetry } from '../server/ai/generation';

const statusError = (status: number): Error =>
  Object.assign(new Error(`HTTP ${status}`), { status });

describe('provider retry policy', () => {
  afterEach(() => vi.useRealTimers());

  it.each([429, 500, 502, 503])('retries status %s', status => {
    expect(isRetryableProviderError(statusError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404])('does not retry status %s', status => {
    expect(isRetryableProviderError(statusError(status))).toBe(false);
  });

  it('uses two backoff retries for retryable failures', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(statusError(503))
      .mockRejectedValueOnce(statusError(429))
      .mockResolvedValue('ok');
    const result = withProviderRetry(operation);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry client errors', async () => {
    const operation = vi.fn().mockRejectedValue(statusError(403));
    await expect(withProviderRetry(operation)).rejects.toMatchObject({ status: 403 });
    expect(operation).toHaveBeenCalledOnce();
  });
});
