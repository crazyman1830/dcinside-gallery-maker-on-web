import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import {
  isRetryableProviderError,
  ProviderRpcCapacityError,
  ProviderRpcLimiter,
  providerRpcLimiter,
  streamGalleryGeneration,
  withProviderRetry,
} from '../server/ai/generation';
import type { PromptContext } from '../services/prompts/context';

const statusError = (status: number): Error =>
  Object.assign(new Error(`HTTP ${status}`), { status });

const promptContext: PromptContext = {
  topic: 'topic',
  discussionContext: '',
  worldviewValue: 'NONE',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
};

describe('provider retry policy', () => {
  afterEach(() => vi.useRealTimers());

  it('classifies retryable and terminal HTTP statuses', () => {
    for (const status of [429, 500, 502, 503]) {
      expect(isRetryableProviderError(statusError(status))).toBe(true);
    }
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryableProviderError(statusError(status))).toBe(false);
    }
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

  it('keeps a capacity slot until the underlying provider promise settles', async () => {
    const limiter = new ProviderRpcLimiter(1);
    let finishProviderCall!: () => void;
    const providerCall = limiter.run(
      () =>
        new Promise<void>(resolve => {
          finishProviderCall = resolve;
        }),
    );

    expect(limiter.activeCount).toBe(1);
    await expect(limiter.run(async () => undefined)).rejects.toBeInstanceOf(
      ProviderRpcCapacityError,
    );
    expect(limiter.activeCount).toBe(1);
    expect(isRetryableProviderError(new ProviderRpcCapacityError())).toBe(false);

    finishProviderCall();
    await providerCall;
    expect(limiter.activeCount).toBe(0);
  });

  it('closes the underlying provider stream before releasing its slot', async () => {
    const streamIterator = {
      next: vi.fn().mockResolvedValue({
        done: false,
        value: { text: 'first', candidates: [] },
      }),
      return: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    };
    const ai = {
      models: {
        generateContentStream: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: () => streamIterator,
        }),
      },
    } as unknown as GoogleGenAI;
    const stream = await streamGalleryGeneration(ai, promptContext, 'model');

    for await (const chunk of stream) {
      expect(chunk.text).toBe('first');
      break;
    }

    expect(streamIterator.return).toHaveBeenCalledOnce();
    expect(providerRpcLimiter.activeCount).toBe(0);
  });
});
