
import { Post, GalleryData } from '../../types';
import { PromptContext } from './context';

export const EVALUATION_PROMPT_VERSION = "2.0.0";

export const buildPostEvaluationPrompt = (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext
) => {
    const prompt = `
// PROMPT VERSION: ${EVALUATION_PROMPT_VERSION}
**1. INPUT DATA**
Title: ${userPost.title}
Content: ${userPost.content}

**2. EVALUATION LOGIC**
1. Worldview fit? -> High Recommendations.
2. Character break? -> High Non-Recommendations.
3. Clickbait? -> High Views.

**3. OUTPUT SPECIFICATION**
Output valid JSON matching the Schema.

**4. TASK (EXECUTE NOW)**
Evaluate the User Post for Engagement Metrics based on the logic above.
    `;

    return { prompt };
};

export const buildWorldviewFeedbackPrompt = (
    customWorldviewText: string,
    galleryData: GalleryData
) => {
    const prompt = `
// PROMPT VERSION: ${EVALUATION_PROMPT_VERSION}
**1. INPUT**
- Worldview Setting: "${customWorldviewText}"
- Sample Content (Title): "${galleryData.posts[0]?.title}"

**2. TASK (EXECUTE NOW)**
Act as a Creative Writing Coach. Provide feedback in Korean (Markdown) on:
1. Strengths
2. Weaknesses
3. Expansion Ideas
    `;
    return { prompt };
};
