import { performance } from 'node:perf_hooks';
import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';
import { z } from 'zod';
import {
  DEFAULT_MODEL_BY_PROVIDER,
  EVALUATION_MODEL_BY_PROVIDER,
  MAX_TOTAL_COMMENTS_PER_POST,
  NUMBER_OF_POSTS,
} from '../constants';
import { galleryDataSchema } from '../schemas';
import { createGallery } from '../server/galleryEngine';
import type { CreateGalleryParams, GalleryData } from '../types';

const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
if (!apiKey) {
  console.log(
    'Live evaluation skipped: set GEMINI_API_KEY (or GOOGLE_API_KEY) to make billed external calls.',
  );
  process.exit(0);
}

const selectedModel = process.env.LIVE_EVAL_MODEL?.trim() || DEFAULT_MODEL_BY_PROVIDER.gemini;
const timeoutMs = Number(process.env.LIVE_EVAL_TIMEOUT_MS ?? 8 * 60 * 1_000);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error('LIVE_EVAL_TIMEOUT_MS must be a positive number.');
}

const profile = {
  nicknameType: 'FIXED' as const,
  nickname: '품질평가자',
  reputation: 50,
};

const base: Omit<
  CreateGalleryParams,
  'topic' | 'discussionContext' | 'worldviewValue' | 'worldviewEraValue'
> = {
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '인간',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel,
  useSearch: false,
  userProfile: profile,
};

const fixtures: Array<{ name: string; params: CreateGalleryParams }> = [
  {
    name: 'contemporary-meme',
    params: {
      ...base,
      topic: '고양이',
      discussionContext: '고양이가 새벽마다 집사를 깨우는 이유와 대처법',
      worldviewValue: 'NONE',
      worldviewEraValue: 'CONTEMPORARY',
    },
  },
  {
    name: 'murim',
    params: {
      ...base,
      topic: '무공',
      discussionContext: '초보자가 가장 먼저 익혀야 할 심법 논쟁',
      worldviewValue: 'MURIM',
      worldviewEraValue: 'MEDIEVAL',
      userSpecies: '무림인',
      userAffiliation: '정파와 사파',
    },
  },
  {
    name: 'fantasy',
    params: {
      ...base,
      topic: '몬스터 요리',
      discussionContext: '슬라임과 드래곤 고기를 안전하게 조리하는 법',
      worldviewValue: 'FANTASY',
      worldviewEraValue: 'MEDIEVAL',
      userSpecies: '인간, 엘프, 드워프',
      userAffiliation: '모험가 길드',
    },
  },
  {
    name: 'custom-cyberpunk',
    params: {
      ...base,
      topic: '임플란트',
      discussionContext: '불법 개조 펌웨어의 성능과 부작용 제보',
      worldviewValue: 'CUSTOM',
      customWorldviewText:
        '초거대 기업이 지배하는 네온 도시에서 시민 대부분이 신체를 기계로 개조했다.',
      worldviewEraValue: 'NEAR_FUTURE',
      toxicityLevelValue: 'SPICY',
      anonymousNickRatioValue: 'HIGH_ANON',
      userSpecies: '인간, 사이보그',
      userAffiliation: '도시 주민',
    },
  },
  {
    name: 'historical',
    params: {
      ...base,
      topic: '과거 시험',
      discussionContext: '이번 식년시 시제 난이도와 합격 전략',
      worldviewValue: 'NONE',
      worldviewEraValue: 'EARLY_MODERN',
      anonymousNickRatioValue: 'LOW_ANON',
      userAffiliation: '성균관 유생',
    },
  },
];

interface EvaluationResult {
  scenario: string;
  latencyMs: number;
  posts: number;
  comments: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  immersion: number | null;
  relevance: number | null;
  diversity: number | null;
  qualityAverage: number | null;
  passed: boolean;
  failures: string[];
}

const bannedExactAuthors = new Set(['나', '(글쓴이)', profile.nickname]);

const qualityScoreSchema = z
  .object({
    immersion: z.number().min(1).max(5),
    relevance: z.number().min(1).max(5),
    diversity: z.number().min(1).max(5),
    rationale: z.string().max(500),
  })
  .strict();

const qualityResponseSchema = {
  type: Type.OBJECT,
  properties: {
    immersion: { type: Type.NUMBER },
    relevance: { type: Type.NUMBER },
    diversity: { type: Type.NUMBER },
    rationale: { type: Type.STRING },
  },
  required: ['immersion', 'relevance', 'diversity', 'rationale'],
};

interface TokenUsage {
  prompt: number;
  output: number;
  total: number;
}

const addUsage = (usage: TokenUsage, response: GenerateContentResponse): void => {
  usage.prompt += response.usageMetadata?.promptTokenCount ?? 0;
  usage.output += response.usageMetadata?.candidatesTokenCount ?? 0;
  usage.total += response.usageMetadata?.totalTokenCount ?? 0;
};

const createMeteredClient = (usage: TokenUsage): GoogleGenAI => {
  const client = new GoogleGenAI({ apiKey });
  const generateContent = client.models.generateContent.bind(client.models);
  const generateContentStream = client.models.generateContentStream.bind(client.models);

  client.models.generateContent = async params => {
    const response = await generateContent(params);
    addUsage(usage, response);
    return response;
  };
  client.models.generateContentStream = async params => {
    const stream = await generateContentStream(params);
    return (async function* meteredStream() {
      let finalUsage: GenerateContentResponse | undefined;
      for await (const chunk of stream) {
        if (chunk.usageMetadata) finalUsage = chunk;
        yield chunk;
      }
      if (finalUsage) addUsage(usage, finalUsage);
    })();
  };
  return client;
};

const scoreQuality = async (ai: GoogleGenAI, params: CreateGalleryParams, gallery: GalleryData) => {
  const response = await ai.models.generateContent({
    model: EVALUATION_MODEL_BY_PROVIDER.gemini,
    contents: `You are evaluating a synthetic Korean community gallery. Score each dimension from 1.0 to 5.0.
- immersion: internal consistency and believable community tone
- relevance: direct connection to the requested topic and discussion context
- diversity: non-repetitive posts, authors, viewpoints, and comments

Requested topic: ${params.topic}
Discussion context: ${params.discussionContext}
Gallery JSON: ${JSON.stringify(gallery)}

Return strict JSON only. Be demanding; 4.0 means release quality.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: qualityResponseSchema,
      maxOutputTokens: 256,
    },
  });
  return qualityScoreSchema.parse(JSON.parse(response.text ?? '{}') as unknown);
};

const evaluateGallery = (
  scenario: string,
  latencyMs: number,
  gallery: GalleryData,
  usage: TokenUsage,
  scores: z.infer<typeof qualityScoreSchema>,
): EvaluationResult => {
  const failures: string[] = [];
  const parsed = galleryDataSchema.safeParse(gallery);
  if (!parsed.success) failures.push(`schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  if (gallery.posts.length !== NUMBER_OF_POSTS) {
    failures.push(`posts: expected ${NUMBER_OF_POSTS}, received ${gallery.posts.length}`);
  }

  const comments = gallery.posts.flatMap(post => post.comments);
  if (gallery.posts.some(post => post.comments.length > MAX_TOTAL_COMMENTS_PER_POST)) {
    failures.push(`comment cap exceeded (${MAX_TOTAL_COMMENTS_PER_POST})`);
  }
  if (
    !gallery.galleryTitle.trim() ||
    gallery.posts.some(post => !post.title.trim() || !post.author.trim() || !post.content.trim()) ||
    comments.some(comment => !comment.author.trim() || !comment.text.trim())
  ) {
    failures.push('empty title, author, content, or comment');
  }

  const authors = [
    ...gallery.posts.map(post => post.author),
    ...comments.map(comment => comment.author),
  ];
  const bannedAuthors = authors.filter(author => bannedExactAuthors.has(author.trim()));
  if (bannedAuthors.length) {
    failures.push(`author ban: ${[...new Set(bannedAuthors)].join(', ')}`);
  }

  const qualityAverage = (scores.immersion + scores.relevance + scores.diversity) / 3;
  if (qualityAverage < 4) failures.push(`quality average below 4.0 (${qualityAverage.toFixed(2)})`);

  return {
    scenario,
    latencyMs: Math.round(latencyMs),
    posts: gallery.posts.length,
    comments: comments.length,
    promptTokens: usage.prompt,
    outputTokens: usage.output,
    totalTokens: usage.total,
    immersion: scores.immersion,
    relevance: scores.relevance,
    diversity: scores.diversity,
    qualityAverage,
    passed: failures.length === 0,
    failures,
  };
};

const results: EvaluationResult[] = [];

console.log(
  `Running ${fixtures.length} billed live scenarios with ${selectedModel}. Search grounding is disabled.`,
);
for (const fixture of fixtures) {
  const startedAt = performance.now();
  const usage: TokenUsage = { prompt: 0, output: 0, total: 0 };
  const ai = createMeteredClient(usage);
  try {
    const gallery = await createGallery(
      ai,
      fixture.params,
      {
        onChunk: () => undefined,
        onPhase: () => undefined,
        onWarning: warning => console.warn(`[${fixture.name}] warning: ${warning.code}`),
      },
      AbortSignal.timeout(timeoutMs),
    );
    const scores = await scoreQuality(ai, fixture.params, gallery);
    results.push(
      evaluateGallery(fixture.name, performance.now() - startedAt, gallery, usage, scores),
    );
  } catch (error) {
    results.push({
      scenario: fixture.name,
      latencyMs: Math.round(performance.now() - startedAt),
      posts: 0,
      comments: 0,
      promptTokens: usage.prompt,
      outputTokens: usage.output,
      totalTokens: usage.total,
      immersion: null,
      relevance: null,
      diversity: null,
      qualityAverage: null,
      passed: false,
      failures: [error instanceof Error ? `${error.name}: ${error.message}` : String(error)],
    });
  }
}

console.table(
  results.map(result => ({
    scenario: result.scenario,
    passed: result.passed,
    latencyMs: result.latencyMs,
    posts: result.posts,
    comments: result.comments,
    totalTokens: result.totalTokens,
    immersion: result.immersion,
    relevance: result.relevance,
    diversity: result.diversity,
    qualityAverage: result.qualityAverage?.toFixed(2) ?? 'n/a',
    failures: result.failures.join('; '),
  })),
);

const sortedLatency = results.map(result => result.latencyMs).sort((a, b) => a - b);
const percentile = (fraction: number) =>
  sortedLatency[Math.min(sortedLatency.length - 1, Math.ceil(sortedLatency.length * fraction) - 1)];
console.log(
  `Summary: ${results.filter(result => result.passed).length}/${results.length} passed; ` +
    `p50=${percentile(0.5)}ms; p95=${percentile(0.95)}ms.`,
);

if (results.some(result => !result.passed)) process.exitCode = 1;
