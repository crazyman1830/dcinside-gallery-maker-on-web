import { AsyncLocalStorage } from 'node:async_hooks';

export interface AiMeasurement {
  calls: number;
  retries: number;
  usageResponses: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}
export const aiMeasurements = new AsyncLocalStorage<AiMeasurement>();
export const createAiMeasurement = (): AiMeasurement => ({
  calls: 0,
  retries: 0,
  usageResponses: 0,
  promptTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

export const recordAiCall = (retry: boolean): void => {
  const current = aiMeasurements.getStore();
  if (!current) return;
  current.calls += 1;
  if (retry) current.retries += 1;
};

/** Collect only numerical SDK usage. Missing usage stays distinguishable from zero. */
export const recordAiUsage = (response: unknown): void => {
  const current = aiMeasurements.getStore();
  if (!current || !response || typeof response !== 'object') return;
  const usage = (response as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  if (!usage) return;
  const count = (key: string) =>
    typeof usage[key] === 'number' && Number.isFinite(usage[key]) && usage[key] >= 0
      ? usage[key]
      : 0;
  current.usageResponses += 1;
  current.promptTokens += count('promptTokenCount');
  current.outputTokens += count('candidatesTokenCount');
  current.totalTokens += count('totalTokenCount');
};
