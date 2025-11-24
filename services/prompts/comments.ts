
import { Post, Comment } from '../../types';
import { PromptContext } from './context';
import { generateToxicitySpecificInstructions } from './instructions';

export const buildCommentGenerationPrompt = (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext,
    minComments: number,
    maxComments: number
) => {
    const { temperature } = generateToxicitySpecificInstructions(galleryContext.toxicityLevelValue);
    const numberOfCommentsToGenerate = Math.max(minComments, Math.floor(Math.random() * (maxComments - minComments + 1)) + minComments);

    const prompt = `
        **TASK: Generate ${numberOfCommentsToGenerate} comments for a specific user post.**

        **Target Post:**
        - Title: "${userPost.title}"
        - Author: "${userPost.author}"
        - Content: "${userPost.content}"

        **Directives:**
        - React to the post content based on the defined Persona and Worldview.
        - **Persona Acting:** If the author has a 'Fixed Nick', ensure the tone matches the nickname.
        - If the post is "noob-like", mock it (if Spicy) or help (if Mild).
        - Use "@Nickname " to reply to other generated comments in this batch to create conversation chains.
        - Include (콘: ...) descriptions for visual reactions.
        
        **Output format (STRICT JSON):**
        - JSON Array of objects.
        - Keys: "author", "text".
        - Example: [{ "author": "유동닉1", "text": "ㄹㅇㅋㅋ" }]
    `;

    return { prompt, temperature, numberOfCommentsToGenerate };
};

export const buildFollowUpCommentPrompt = (
    originalPost: Pick<Post, 'title' | 'author' | 'content'>,
    existingComments: Comment[],
    galleryContext: PromptContext,
    minCommentsToGenerate: number,
    maxCommentsToGenerate: number
) => {
    const { temperature } = generateToxicitySpecificInstructions(galleryContext.toxicityLevelValue);
    const numberOfCommentsToGenerate = Math.max(minCommentsToGenerate, Math.floor(Math.random() * (maxCommentsToGenerate - minCommentsToGenerate + 1)) + minCommentsToGenerate);

    // We condense the existing comments to save tokens but keep context
    const contextSummary = existingComments.slice(-5).map(c => `${c.author}: ${c.text.substring(0, 50)}`).join('\n');

    const prompt = `
        **TASK: Continue the discussion with ${numberOfCommentsToGenerate} new comments.**

        **Original Post:** "${originalPost.title}" by ${originalPost.author}
        **Recent Thread History:**
        ${contextSummary}

        **Directives:**
        - React to the latest comments naturally.
        - Maintain the gallery's toxicity and worldview settings.
        - **Persona Acting:** Maintain consistency with the nicknames.
        - Create drama or consensus based on the flow.
        
        **Output JSON Specification (STRICT):**
        - Return ONLY a JSON Array.
        - Keys: "author", "text".
        - Example: [{ "author": "고정닉1", "text": "이게 맞지" }]
    `;

    return { prompt, temperature, numberOfCommentsToGenerate };
};
