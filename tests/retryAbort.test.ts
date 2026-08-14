import { afterEach, describe, expect, it, vi } from 'vitest';
import { withProviderRetry } from '../server/ai/generation';
import { ClientAbortError } from '../server/http';

describe('provider retry cancellation', () => {
  afterEach(() => vi.useRealTimers());

  it('stops immediately when aborted during retry backoff', async () => {
    vi.useFakeTimers();
    const operation = vi.fn(async () => {
      throw Object.assign(new Error('HTTP 503'), { status: 503 });
    });
    const controller = new AbortController();
    const result = withProviderRetry(operation, { signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    const reason = new ClientAbortError();
    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
