import type { Post } from '../../types';
import type { PromptContext } from './context';
import { buildPromptDataEnvelope, buildSimulationContextData } from './simulationContext';

export const EVALUATION_PROMPT_VERSION = '3.0.0';

const MAX_FEEDBACK_POSTS = 5;
const MAX_FEEDBACK_POST_CONTENT_CHARS = 1_200;
const MAX_FEEDBACK_COMMENTS_PER_POST = 4;
const MAX_FEEDBACK_COMMENT_CHARS = 300;

export interface WorldviewFeedbackGallerySample {
  galleryTitle: string;
  posts: ReadonlyArray<{
    title: string;
    content?: string;
    comments?: ReadonlyArray<{ author: string; text: string }>;
  }>;
}

export type WorldviewFeedbackGalleryInput =
  WorldviewFeedbackGallerySample | { gallerySample: WorldviewFeedbackGallerySample };

const truncate = (value: string, maxCharacters: number): string =>
  value.length <= maxCharacters
    ? value
    : `${value.slice(0, Math.max(0, maxCharacters - 14))}… [truncated]`;

const unwrapGallerySample = (
  input: WorldviewFeedbackGalleryInput,
): WorldviewFeedbackGallerySample => ('gallerySample' in input ? input.gallerySample : input);

const buildBoundedGallerySample = (input: WorldviewFeedbackGalleryInput) => {
  const gallery = unwrapGallerySample(input);
  const posts = gallery.posts.slice(0, MAX_FEEDBACK_POSTS).map(post => ({
    title: post.title,
    content: truncate(post.content ?? '', MAX_FEEDBACK_POST_CONTENT_CHARS),
    comments: (post.comments ?? []).slice(-MAX_FEEDBACK_COMMENTS_PER_POST).map(comment => ({
      author: comment.author,
      text: truncate(comment.text, MAX_FEEDBACK_COMMENT_CHARS),
    })),
  }));

  return {
    galleryTitle: gallery.galleryTitle,
    totalPostCount: gallery.posts.length,
    includedPostCount: posts.length,
    posts,
  };
};

export const buildPostEvaluationPrompt = (
  userPost: Pick<Post, 'title' | 'author' | 'content'>,
  galleryContext: PromptContext,
) => {
  const dataEnvelope = buildPromptDataEnvelope('post_engagement_evaluation', {
    simulation: buildSimulationContextData(galleryContext),
    task: {
      targetPost: userPost,
    },
  });
  const prompt = `
// PROMPT VERSION: ${EVALUATION_PROMPT_VERSION}

**FIXED ENGAGEMENT RUBRIC**
Evaluate task.targetPost as a newly submitted thread in the configured simulated gallery.

1. Worldview/era fit (40%): internally consistent use of setting, terminology, and era constraints raises recommendations. A clear character or era break raises non-recommendations.
2. Community authenticity (25%): a natural title, insider voice, and fit with the configured toxicity/demographics raise recommendations. Assistant-like exposition and parenthetical definitions lower them.
3. Interest/click appeal (25%): specificity, novelty, humor, controversy, and relevance to the burning issue raise views. Clickbait may raise views without raising recommendations.
4. Coherence (10%): readable internal logic raises recommendations; incoherence raises non-recommendations.

**NUMERIC SCALE AND INVARIANTS**
- suggestedViews: integer from 20 through 5,000.
- suggestedRecommendations: integer from 0 through suggestedViews.
- suggestedNonRecommendations: integer from 0 through suggestedViews.
- suggestedRecommendations + suggestedNonRecommendations MUST be <= suggestedViews.
- Total reactions should normally be <= 35% of views. Exceed that only for unusually polarizing content and still preserve the invariant above.
- Strong fit usually means recommendations are 65-90% of reactions; neutral/mixed fit 40-65%; a major setting break 0-40%. Avoid unexplained extreme values.

**OUTPUT CONTRACT (STRICT JSON)**
Return only one object with exactly these integer fields:
{
  "suggestedViews": 20,
  "suggestedRecommendations": 0,
  "suggestedNonRecommendations": 0
}
Do not add explanations, Markdown, or extra keys.

${dataEnvelope}`;

  return { prompt };
};

export const buildWorldviewFeedbackPrompt = (
  customWorldviewText: string,
  galleryInput: WorldviewFeedbackGalleryInput,
) => {
  const dataEnvelope = buildPromptDataEnvelope('worldview_feedback', {
    worldview: {
      customDescription: customWorldviewText,
    },
    gallerySample: buildBoundedGallerySample(galleryInput),
  });
  const prompt = `
// PROMPT VERSION: ${EVALUATION_PROMPT_VERSION}

**FIXED WORLDVIEW-FEEDBACK CONTRACT**
Act as a constructive creative-writing coach. Compare worldview.customDescription with every included post and comment in gallerySample; do not judge from the first title alone and do not claim to have seen omitted content.

Respond in concise Korean Markdown using exactly these headings:
## 강점
## 약점
## 확장 아이디어

Under 강점 and 약점, cite concrete patterns from the bounded sample without long quotations. Under 확장 아이디어, give actionable ways to deepen institutions, conflicts, daily life, and terminology consistency. If the sample is empty or insufficient, state that limitation instead of inventing evidence.

${dataEnvelope}`;

  return { prompt };
};
