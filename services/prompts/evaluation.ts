
import { Post, GalleryData } from '../../types';
import { PromptContext } from './context';

export const buildPostEvaluationPrompt = (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext
) => {
    const prompt = `
**TASK: Evaluate User Post for Engagement Metrics.**

**Post:**
Title: ${userPost.title}
Content: ${userPost.content}

**LOGIC:**
1. Worldview fit? -> High Recommendations.
2. Character break? -> High Non-Recommendations.
3. Clickbait? -> High Views.

Output valid JSON matching the Schema.
    `;

    return { prompt };
};

export const buildWorldviewFeedbackPrompt = (
    customWorldviewText: string,
    galleryData: GalleryData
) => {
    const prompt = `
Role: Creative Writing Coach.
Input: Worldview "${customWorldviewText}", Sample Content "${galleryData.posts[0]?.title}"

Provide feedback in Korean (Markdown):
1. Strengths
2. Weaknesses
3. Expansion Ideas
    `;
    return { prompt };
};
