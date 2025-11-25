
import { Post, Comment } from '../../types';
import { PromptContext } from './context';
import { generateToxicitySpecificInstructions } from './instructions';

export const buildCommentGenerationPrompt = (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext,
    minComments: number,
    maxComments: number
) => {
    const numberOfCommentsToGenerate = Math.max(minComments, Math.floor(Math.random() * (maxComments - minComments + 1)) + minComments);

    const prompt = `
**TASK: Generate ${numberOfCommentsToGenerate} comments for a user post.**

**Target Post:**
- Title: "${userPost.title}"
- Author: "${userPost.author}"
- Content: "${userPost.content}"

**DIRECTIVES:**
- React based on the defined Persona and Worldview.
- **Acting:** 'Fixed Nick' authors must match their name's vibe.
- **Interaction:** Use "@Nickname " to reply to other comments in this batch.
- **Visuals:** Use (콘: ...) for emoji/sticker reactions.

**OUTPUT (STRICT JSON):**
- JSON Array of objects: [{ "author": "String", "text": "String" }]
    `;

    return { prompt, numberOfCommentsToGenerate };
};

export const buildFollowUpCommentPrompt = (
    originalPost: Pick<Post, 'title' | 'author' | 'content'>,
    existingComments: Comment[],
    galleryContext: PromptContext,
    minCommentsToGenerate: number,
    maxCommentsToGenerate: number
) => {
    const numberOfCommentsToGenerate = Math.max(minCommentsToGenerate, Math.floor(Math.random() * (maxCommentsToGenerate - minCommentsToGenerate + 1)) + minCommentsToGenerate);

    // Context summary
    const contextSummary = existingComments.slice(-5).map(c => `${c.author}: ${c.text.substring(0, 50)}`).join('\n');

    const prompt = `
**TASK: Continue the discussion with ${numberOfCommentsToGenerate} new comments.**

**Context:**
- Post: "${originalPost.title}"
- Recent Comments:
${contextSummary}

**DIRECTIVES:**
- Continue the flow naturally.
- Maintain Toxicity and Worldview settings.
- Create drama or consensus.

**OUTPUT (STRICT JSON):**
- JSON Array of objects: [{ "author": "String", "text": "String" }]
    `;

    return { prompt, numberOfCommentsToGenerate };
};
