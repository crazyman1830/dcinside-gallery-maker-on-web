import { describe, expect, it } from 'vitest';
import {
  aiMeasurements,
  createAiMeasurement,
  recordAiCall,
  recordAiUsage,
} from '../server/ai/telemetry';

describe('request-scoped AI measurements', () => {
  it('separates concurrent requests and records only reported numerical usage', async () => {
    const first = createAiMeasurement();
    const second = createAiMeasurement();
    await Promise.all([
      aiMeasurements.run(first, async () => {
        recordAiCall(false);
        await Promise.resolve();
        recordAiCall(true);
        recordAiUsage({
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
          text: 'do not log',
        });
        recordAiUsage(undefined);
      }),
      aiMeasurements.run(second, async () => {
        await Promise.resolve();
        recordAiCall(false);
        recordAiUsage({ text: 'usage unavailable' });
      }),
    ]);
    expect(first).toEqual({
      calls: 2,
      retries: 1,
      usageResponses: 1,
      promptTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    });
    expect(second).toEqual({
      calls: 1,
      retries: 0,
      usageResponses: 0,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    recordAiCall(false);
    recordAiUsage({ usageMetadata: {} });
    expect(first.calls).toBe(2);
  });
});
