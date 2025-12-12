
import { PromptContext } from './context';
import {
    generateWorldviewSpecificInstructions,
    generateToxicitySpecificInstructions,
} from './instructions';
import {
    NUMBER_OF_POSTS,
    MIN_COMMENTS_PER_BEST_POST,
    MAX_COMMENTS_PER_BEST_POST,
    MIN_COMMENTS_PER_POST,
    MAX_COMMENTS_PER_POST,
} from '../../constants';

export const GALLERY_PROMPT_VERSION = "2.0.2";

export const buildGalleryGenerationPrompt = (
    ctx: PromptContext
) => {
    const { eraLabelForTitlePrompt, worldviewLabelKoreanPart, eraConstraints } = generateWorldviewSpecificInstructions(
        ctx.worldviewValue, 
        ctx.customWorldviewText, 
        ctx.worldviewEraValue
    );
    const { selectedToxicity } = generateToxicitySpecificInstructions(ctx.toxicityLevelValue);
    const toxicityNameForTitle = selectedToxicity.nameForTitle;

    let googleSearchInstruction = "";
    let jsonFormattingInstruction = "";

    if (ctx.useSearch) {
        googleSearchInstruction = `
[TOOL USE]
- Use Google Search to find REAL trending news/memes about "${ctx.topic}".
- Integrate findings into post content to enhance realism.
        `;

        jsonFormattingInstruction = `
**JSON OUTPUT SPECIFICATION (STRICT)**
Output ONLY a single valid JSON object.
Structure:
{
  "galleryTitle": "String (Format: [${ctx.topic}] 갤러리 - ${worldviewLabelKoreanPart}${eraLabelForTitlePrompt ? ` (${eraLabelForTitlePrompt})` : ''} - [${toxicityNameForTitle}])",
  "posts": [
    {
      "title": "String",
      "author": "String",
      "content": "String (include media descriptions)",
      "comments": [
          { "author": "String", "text": "String" }
      ]
    }
  ]
}
        `;
    }

    let explicitTechBanInstruction = "";
    if (eraConstraints) {
        explicitTechBanInstruction = `
**ERA COMPLIANCE & VOCABULARY FILTER (STRICT)**
- **Constraints:** ${eraConstraints}
- **Action:** Scan all generated titles, content, and comments. If a term violates the constraints (e.g., using "Truck" in Medieval), REPLACE it with a context-appropriate term (e.g., "Wagon").
- **Directive:** Do not explain the replacement in the text, just use the correct era-specific term.
        `;
    }

    const prompt = `
// PROMPT VERSION: ${GALLERY_PROMPT_VERSION}
**1. CONTEXT & SETTINGS**
- **Topic:** "${ctx.topic}"
- **Burning Issue:** "${ctx.discussionContext || 'Daily chatter'}"
- **Worldview:** ${worldviewLabelKoreanPart} / ${eraLabelForTitlePrompt}
${googleSearchInstruction}

**2. REQUIREMENTS & GUIDELINES**
- **Requirements:** Generate EXACTLY ${NUMBER_OF_POSTS} posts.
- **Post 1 (Best Post):** High quality, funny or controversial. ${MIN_COMMENTS_PER_BEST_POST}-${MAX_COMMENTS_PER_BEST_POST} comments.
- **Posts 2-${NUMBER_OF_POSTS}:** Standard posts. ${MIN_COMMENTS_PER_POST}-${MAX_COMMENTS_PER_POST} comments.
- **Title Field:** "[${ctx.topic}] 갤러리 - ${worldviewLabelKoreanPart}${eraLabelForTitlePrompt ? ` (${eraLabelForTitlePrompt})` : ''} - [${toxicityNameForTitle}]"
- **Replies:** Use "@Nickname " to create conversation chains.
- **Media:** Randomly include (사진: ...), (동영상: ...) in posts. MUST match the Era/Worldview.
- **Reactions:** Use (콘: ...) in comments for visual reactions.
- **Immersion Enforcement:** DO NOT include definitions or translations in parentheses (e.g., "BD(Brain Dance)" is banned). Just use "BD".

${explicitTechBanInstruction}

${jsonFormattingInstruction}

**3. TASK (EXECUTE NOW)**
Generate the initial page of the "${ctx.topic}" Gallery based on the above settings. 
Ensure the output is verbose, authentic, and strictly adheres to the requested format.
  `;

    return { prompt };
};
