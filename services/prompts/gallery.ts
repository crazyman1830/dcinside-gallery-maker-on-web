import { PromptContext } from './context';
import {
  generateWorldviewSpecificInstructions,
  generateToxicitySpecificInstructions,
} from './instructions';
import { NUMBER_OF_POSTS } from '../../constants';
import { resolveUserNickname } from '../../utils/common';
import { buildSimulationContextPrompt } from './simulationContext';

export const GALLERY_PROMPT_VERSION = '2.1.0';

export const buildGalleryGenerationPrompt = (ctx: PromptContext) => {
  const { eraLabelForTitlePrompt, worldviewLabelKoreanPart, eraConstraints } =
    generateWorldviewSpecificInstructions(
      ctx.worldviewValue,
      ctx.customWorldviewText,
      ctx.worldviewEraValue,
    );
  const { selectedToxicity } = generateToxicitySpecificInstructions(ctx.toxicityLevelValue);
  const toxicityNameForTitle = selectedToxicity.nameForTitle;

  const currentUserNick = resolveUserNickname(ctx.userProfile ?? null);
  const userIp = ctx.userProfile?.nicknameType === 'ANONYMOUS' ? ctx.userProfile.ip : null;
  const authorBanInstruction = `- **AUTHOR BAN (CRITICAL):** You MUST NEVER use "나" or "(글쓴이)" as an author name.${currentUserNick ? ` You MUST ALSO NEVER use exactly "${currentUserNick}" (which is the Active User).` : ''}${userIp ? ` If generating anonymous users, their IP addresses MUST NEVER contain "${userIp}".` : ''} Generate completely separate fictional identities for all posts and comments.`;

  let googleSearchInstruction = '';
  let jsonFormattingInstruction = '';

  if (ctx.useSearch) {
    googleSearchInstruction = `
[TOOL USE & EXCLUSIVE SEARCH FOCUS (CRITICAL)]
- Use Google Search to find REAL trending news/memes about "${ctx.topic}" and "${ctx.discussionContext || ''}".
- **CRITICAL DIRECTIVE:** Because search is enabled, you MUST construct all posts and comments **EXCLUSIVELY** based on the real-time facts, events, and data retrieved from the search results. 
- Do NOT mix in your outdated prior knowledge or hallucinate past events. If you retrieved information about recent trends, the characters in the gallery MUST only talk about those recent trends, to prevent sync issues. Let the search results completely dictate the narrative.
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
      "content": "String (include media descriptions)"
    }
  ]
}
        `;
  }

  let explicitTechBanInstruction = '';
  if (eraConstraints) {
    explicitTechBanInstruction = `
**ERA COMPLIANCE & VOCABULARY FILTER (STRICT)**
- **Constraints:** ${eraConstraints}
- **Action:** Scan all generated titles and content. If a term violates the constraints (e.g., using "Truck" in Medieval), REPLACE it with a context-appropriate term (e.g., "Wagon").
- **Directive:** Do not explain the replacement in the text, just use the correct era-specific term.
        `;
  }

  const prompt = `
// PROMPT VERSION: ${GALLERY_PROMPT_VERSION}
${buildSimulationContextPrompt(ctx)}

**1. CONTEXT & SETTINGS**
- **Topic:** "${ctx.topic}"
- **Burning Issue:** "${ctx.discussionContext || 'Daily chatter'}"
- **Worldview:** ${worldviewLabelKoreanPart} / ${eraLabelForTitlePrompt}
${googleSearchInstruction}

**2. REQUIREMENTS & GUIDELINES**
- **Requirements:** Generate EXACTLY ${NUMBER_OF_POSTS} posts. DO NOT GENERATE COMMENTS.
- **Post 1 (Best Post):** High quality, funny or controversial. Make it feel like a very popular, highly-discussed post.
- **Posts 2-${NUMBER_OF_POSTS}:** Standard posts.
- **Title Field:** "[${ctx.topic}] 갤러리 - ${worldviewLabelKoreanPart}${eraLabelForTitlePrompt ? ` (${eraLabelForTitlePrompt})` : ''} - [${toxicityNameForTitle}]"
- **Media:** Randomly include (사진: ...), (동영상: ...) in posts. MUST match the Era/Worldview.
${authorBanInstruction}
- **Immersion Enforcement:** 
  - **NO DEFINITIONS:** "BD(Brain Dance)" -> "BD"
  - **NO TRANSLATIONS:** "족보(Jokbo)" -> "족보"
  - **NO HANJA:** "야(也)" -> "야"

${explicitTechBanInstruction}

${jsonFormattingInstruction}

**3. TASK (EXECUTE NOW)**
Generate the initial page of the "${ctx.topic}" Gallery based on the above settings. 
Ensure the output is verbose, authentic, and strictly adheres to the requested format.
  `;

  return { prompt };
};
