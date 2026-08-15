import { z } from 'zod';
import { NUMBER_OF_POSTS } from './constants';
import { WORLDLINE_ID_PATTERN } from './utils/worldline';

const nonEmptyTrimmed = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalTrimmed = (maximum: number) => z.string().trim().max(maximum);
const safeCount = z.number().int().nonnegative().max(1_000_000_000);

const oneOf = <const T extends readonly string[]>(values: T) =>
  z.string().refine((value): value is T[number] => values.includes(value), {
    message: `Expected one of: ${values.join(', ')}`,
  });

export const aiProviderSchema = z.enum(['gemini', 'vertex']);
export const userNicknameTypeSchema = z.enum(['FIXED', 'ANONYMOUS']);
export const worldlineIdSchema = z
  .string()
  .regex(WORLDLINE_ID_PATTERN, 'Invalid worldline identifier.');

export const replyTargetSchema = z
  .object({
    commentId: nonEmptyTrimmed(256),
    author: nonEmptyTrimmed(64),
  })
  .strict();

export const userProfileSchema = z
  .object({
    nicknameType: userNicknameTypeSchema,
    nickname: nonEmptyTrimmed(10),
    ip: optionalTrimmed(16).optional(),
    reputation: z.number().int().min(0).max(100),
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.nicknameType === 'ANONYMOUS' && profile.ip) {
      if (!/^\(\d{1,3}\.\d{1,3}\)$/.test(profile.ip)) {
        context.addIssue({
          code: 'custom',
          path: ['ip'],
          message: 'Anonymous IP must have the form (123.45).',
        });
      }
    }
  });

const worldviewValues = ['NONE', 'MURIM', 'FANTASY', 'CUSTOM'] as const;
const worldviewEraValues = [
  '',
  'PREHISTORIC',
  'ANCIENT',
  'MEDIEVAL',
  'EARLY_MODERN',
  'CONTEMPORARY',
  'NEAR_FUTURE',
  'FAR_FUTURE',
] as const;
const toxicityValues = ['MILD', 'MEDIUM', 'SPICY'] as const;
const anonymousRatioValues = ['LOW_ANON', 'BALANCED', 'HIGH_ANON'] as const;
const ageRangeValues = [
  'TEENS',
  'TWENTIES',
  'THIRTIES',
  'FORTIES',
  'FIFTIES',
  'SIXTIES',
  'SEVENTIES_PLUS',
] as const;

const modelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Invalid model identifier.');
const genderRatioSchema = z.union([z.literal('AUTO'), z.string().regex(/^(?:0|[1-9]\d?|100)$/)]);
const ageRangeSchema = z.union([
  z.literal('AUTO'),
  z
    .array(oneOf(ageRangeValues))
    .min(1)
    .max(ageRangeValues.length)
    .refine(values => new Set(values).size === values.length, 'Age groups must be unique.'),
]);

const createGalleryParamFields = {
  topic: nonEmptyTrimmed(20),
  discussionContext: optionalTrimmed(500),
  worldviewValue: oneOf(worldviewValues),
  customWorldviewText: optionalTrimmed(500).optional(),
  worldviewEraValue: oneOf(worldviewEraValues),
  toxicityLevelValue: oneOf(toxicityValues),
  anonymousNickRatioValue: oneOf(anonymousRatioValues),
  userSpecies: optionalTrimmed(30),
  userAffiliation: optionalTrimmed(30),
  genderRatioValue: genderRatioSchema,
  ageRangeValue: ageRangeSchema,
  selectedProvider: aiProviderSchema,
  selectedModel: modelSchema,
  useSearch: z.boolean(),
  userProfile: userProfileSchema.optional(),
} as const;

const requireCustomWorldview = (
  params: { worldviewValue: string; customWorldviewText?: string },
  context: z.RefinementCtx,
) => {
  if (params.worldviewValue === 'CUSTOM' && !params.customWorldviewText) {
    context.addIssue({
      code: 'custom',
      path: ['customWorldviewText'],
      message: 'A custom worldview description is required.',
    });
  }
};

export const createGalleryParamsSchema = z
  .object(createGalleryParamFields)
  .strict()
  .superRefine(requireCustomWorldview);

export const galleryContextSchema = z
  .object({ worldlineId: worldlineIdSchema, ...createGalleryParamFields })
  .strict()
  .superRefine(requireCustomWorldview);

export const newPostDataSchema = z
  .object({
    title: nonEmptyTrimmed(50),
    author: nonEmptyTrimmed(18),
    content: nonEmptyTrimmed(500),
  })
  .strict();

const timestampSchema = z.string().max(35).datetime({ offset: true });

export const commentSchema = z
  .object({
    id: nonEmptyTrimmed(256),
    author: nonEmptyTrimmed(64),
    text: nonEmptyTrimmed(1_000),
    timestamp: timestampSchema,
    recommendations: safeCount,
    nonRecommendations: safeCount,
    voted: z.enum(['rec', 'nonrec']).nullable().optional(),
    replyTo: replyTargetSchema.optional(),
  })
  .strict();

export const postSchema: z.ZodType<{
  id: string;
  title: string;
  author: string;
  timestamp: string;
  content: string;
  views: number;
  recommendations: number;
  nonRecommendations: number;
  comments: z.infer<typeof commentSchema>[];
  isBestPost?: boolean;
  voted?: 'rec' | 'nonrec' | null;
}> = z
  .object({
    id: nonEmptyTrimmed(256),
    title: nonEmptyTrimmed(200),
    author: nonEmptyTrimmed(64),
    timestamp: timestampSchema,
    content: nonEmptyTrimmed(10_000),
    views: safeCount,
    recommendations: safeCount,
    nonRecommendations: safeCount,
    comments: z.array(commentSchema).max(30),
    isBestPost: z.boolean().optional(),
    voted: z.enum(['rec', 'nonrec']).nullable().optional(),
  })
  .strict();

export const generationWarningSchema = z
  .object({
    code: nonEmptyTrimmed(64),
    message: nonEmptyTrimmed(500),
    stage: z.enum(['evaluation', 'comments', 'grounding', 'storage']).optional(),
    postId: nonEmptyTrimmed(256).optional(),
  })
  .strict();

export const groundingSourceSchema = z
  .object({
    title: optionalTrimmed(200).optional(),
    uri: z
      .string()
      .trim()
      .max(2_048)
      .url()
      .refine(value => value.startsWith('https://'), {
        message: 'Grounding sources must use HTTPS.',
      })
      .optional(),
  })
  .strict()
  .refine(source => Boolean(source.uri), 'Grounding source URI is required.');

export const MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES = 64 * 1_024;

export const groundingSearchEntryPointSchema = z
  .object({
    // Do not trim or otherwise transform provider-owned markup. Google requires
    // Search Suggestions to be rendered exactly as returned.
    renderedContent: z
      .string()
      .min(1)
      .max(MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES)
      .refine(
        value =>
          new TextEncoder().encode(value).byteLength <= MAX_GROUNDING_SEARCH_ENTRY_POINT_BYTES,
        'Grounding Search Suggestions markup is too large.',
      ),
  })
  .strict();

export const galleryDataSchema = z
  .object({
    galleryTitle: nonEmptyTrimmed(200),
    posts: z.array(postSchema).max(200),
    sources: z.array(groundingSourceSchema).max(20).optional(),
    searchEntryPoint: groundingSearchEntryPointSchema.optional(),
    warnings: z.array(generationWarningSchema).max(100).optional(),
  })
  .strict();

/** Terminal payload for a freshly generated gallery, before user posts are added. */
export const initialGalleryDataSchema = galleryDataSchema.extend({
  posts: z.array(postSchema).length(NUMBER_OF_POSTS),
});

// Google Search Suggestions and grounding links are licensed for transient
// display with the associated response only. They are intentionally excluded
// from persistence and from all subsequent AI inputs.
export const transientFreeGalleryDataSchema = galleryDataSchema.omit({
  sources: true,
  searchEntryPoint: true,
});

export const addUserPostRequestSchema = z
  .object({
    newPostData: newPostDataSchema,
    galleryContext: createGalleryParamsSchema,
  })
  .strict();

export const followUpPostContextSchema = z
  .object({
    id: nonEmptyTrimmed(256),
    title: nonEmptyTrimmed(200),
    author: nonEmptyTrimmed(64),
    content: nonEmptyTrimmed(10_000),
  })
  .strict();

export const followUpCommentsRequestSchema = z
  .object({
    targetPost: followUpPostContextSchema,
    recentComments: z.array(commentSchema).min(1).max(6),
    totalCommentCount: z.number().int().min(1).max(30),
    galleryContext: createGalleryParamsSchema,
  })
  .strict()
  .refine(request => request.totalCommentCount >= request.recentComments.length, {
    message: 'Total comment count cannot be smaller than the supplied recent comments.',
    path: ['totalCommentCount'],
  });

export const worldviewFeedbackCommentSampleSchema = z
  .object({
    author: nonEmptyTrimmed(64),
    text: nonEmptyTrimmed(500),
  })
  .strict();

export const worldviewFeedbackPostSampleSchema = z
  .object({
    title: nonEmptyTrimmed(200),
    content: nonEmptyTrimmed(1_200),
    comments: z.array(worldviewFeedbackCommentSampleSchema).max(3),
  })
  .strict();

export const worldviewFeedbackGallerySampleSchema = z
  .object({
    galleryTitle: nonEmptyTrimmed(200),
    posts: z.array(worldviewFeedbackPostSampleSchema).min(1).max(NUMBER_OF_POSTS),
  })
  .strict();

export const worldviewFeedbackRequestSchema = z
  .object({
    customWorldviewText: nonEmptyTrimmed(500),
    gallerySample: worldviewFeedbackGallerySampleSchema,
    selectedModel: modelSchema,
    selectedProvider: aiProviderSchema.optional(),
  })
  .strict();

// Provider responses intentionally strip unknown keys while normalizing the
// fields the application is willing to retain.
export const geminiCommentContentSchema = z.object({
  author: nonEmptyTrimmed(64),
  text: nonEmptyTrimmed(1_000),
  recommendations: safeCount.optional(),
  nonRecommendations: safeCount.optional(),
});

export const geminiPostContentSchema = z.object({
  title: nonEmptyTrimmed(200),
  author: nonEmptyTrimmed(64),
  content: nonEmptyTrimmed(10_000),
  comments: z.array(geminiCommentContentSchema).max(30).optional(),
});

export const geminiResponseDataSchema = z.object({
  galleryTitle: nonEmptyTrimmed(200),
  posts: z.array(geminiPostContentSchema).length(NUMBER_OF_POSTS),
});

export const geminiEvaluationResponseSchema = z
  .object({
    suggestedViews: safeCount.min(20).max(5_000),
    suggestedRecommendations: safeCount.max(5_000),
    suggestedNonRecommendations: safeCount.max(5_000),
  })
  .refine(
    value =>
      value.suggestedRecommendations + value.suggestedNonRecommendations <= value.suggestedViews,
    {
      message: 'Total votes cannot exceed views.',
      path: ['suggestedViews'],
    },
  );

export const gallerySessionV2Schema = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    savedAt: z.string().datetime({ offset: true }),
    gallery: transientFreeGalleryDataSchema,
    context: galleryContextSchema,
    profile: userProfileSchema.nullable(),
  })
  .strict();
