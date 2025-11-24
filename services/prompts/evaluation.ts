
import { Post, GalleryData } from '../../types';
import { PromptContext } from './context';
import { generateToxicitySpecificInstructions } from './instructions';

export const buildPostEvaluationPrompt = (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext
) => {
    const { temperature } = generateToxicitySpecificInstructions(galleryContext.toxicityLevelValue);

    const prompt = `
        **TASK: Evaluate User Post for Engagement Metrics.**

        **Post:**
        Title: ${userPost.title}
        Content: ${userPost.content}

        **Logic:**
        - If content fits the worldview perfectly -> High Recommendations.
        - If content is 'normie' or breaks character -> High Non-Recommendations.
        - If content is clickbait -> High Views.

        Output valid JSON matching the Schema.
    `;

    return { prompt, temperature };
};

export const buildWorldviewFeedbackPrompt = (
    customWorldviewText: string,
    galleryData: GalleryData
) => {
    const prompt = `
You are a Creative Writing Coach.
User's Worldview: "${customWorldviewText}"
Generated Content Sample: "${galleryData.posts[0]?.title}"

Provide constructive feedback in Korean (Markdown):
1. Strengths
2. Weaknesses/Ambiguities
3. Ideas for expansion
    `;
    return { prompt };
};
