import { type GenerateContentConfig, ThinkingLevel } from '@google/genai';

const ARGON_MIN_OUTPUT_TOKENS = 32_768;

export const getModelGenerationConfig = (
  model: string,
  maxOutputTokens: number,
): Pick<GenerateContentConfig, 'maxOutputTokens' | 'thinkingConfig'> =>
  model === 'gemini-4-argon'
    ? {
        // Argon's limit includes thinking; leave room for the requested text.
        maxOutputTokens: Math.max(maxOutputTokens, ARGON_MIN_OUTPUT_TOKENS),
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      }
    : { maxOutputTokens };
