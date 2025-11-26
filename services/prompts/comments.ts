
import { Post, Comment } from '../../types';
import { PromptContext } from './context';
import { generateToxicitySpecificInstructions, generatePlayerStatusInstructions } from './instructions';
import { resolveUserNickname } from '../../utils/common';

export const buildCommentGenerationPrompt = (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext,
    minComments: number,
    maxComments: number
) => {
    const numberOfCommentsToGenerate = Math.max(minComments, Math.floor(Math.random() * (maxComments - minComments + 1)) + minComments);
    
    // Check if the post author is the Current User
    const currentUserNick = resolveUserNickname(galleryContext.userProfile);
    const isCurrentUserPost = userPost.author === currentUserNick;
    
    let reputationEnforcement = "";
    if (isCurrentUserPost && galleryContext.userProfile) {
        const statusInstructions = generatePlayerStatusInstructions(galleryContext.userProfile);
        reputationEnforcement = `
**⚠️ TARGET DETECTED: CURRENT USER POST ⚠️**
The author "${userPost.author}" is the ACTIVE USER defined in the system instructions.
${statusInstructions}
**MANDATORY:** You MUST generate comments that reflect the user's status (e.g., if Hated, roast them; if Idol, praise them).
        `;
    }

    const prompt = `
**1. CONTEXT: TARGET POST**
- Title: "${userPost.title}"
- Author: "${userPost.author}"
- Content: "${userPost.content}"

${reputationEnforcement}

**2. DIRECTIVES**
- React based on the defined Persona and Worldview.
- **Acting:** 'Fixed Nick' authors must match their name's vibe.
- **Interaction:** Use "@Nickname " to reply to other comments in this batch.
- **Visuals:** Use (콘: ...) for emoji/sticker reactions.

**3. OUTPUT SPECIFICATION (STRICT JSON)**
- JSON Array of objects: [{ "author": "String", "text": "String" }]

**4. TASK (EXECUTE NOW)**
Generate ${numberOfCommentsToGenerate} comments for the post above. Ensure the tone is chatty and authentic to the community settings.
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
    
    // Check if the LAST comment was made by the User
    const lastComment = existingComments[existingComments.length - 1];
    const currentUserNick = resolveUserNickname(galleryContext.userProfile);
    const isLastCommentByUser = lastComment && lastComment.author === currentUserNick;

    let reputationEnforcement = "";
    if (isLastCommentByUser && galleryContext.userProfile) {
         const statusInstructions = generatePlayerStatusInstructions(galleryContext.userProfile);
         reputationEnforcement = `
**⚠️ TARGET DETECTED: CURRENT USER COMMENT ⚠️**
The last comment was made by "${lastComment.author}", who is the ACTIVE USER.
${statusInstructions}
**MANDATORY:** The new comments must REACT IMMEDIATELY to this user based on their status (e.g., attack them if Hated, agree if Idol).
         `;
    }

    const prompt = `
**1. CONTEXT**
- Post: "${originalPost.title}"
- Recent Comments:
${contextSummary}

${reputationEnforcement}

**2. DIRECTIVES**
- Continue the flow naturally.
- Maintain Toxicity and Worldview settings.
- Create drama or consensus.

**3. OUTPUT SPECIFICATION (STRICT JSON)**
- JSON Array of objects: [{ "author": "String", "text": "String" }]

**4. TASK (EXECUTE NOW)**
Continue the discussion with ${numberOfCommentsToGenerate} new comments.
    `;

    return { prompt, numberOfCommentsToGenerate };
};
