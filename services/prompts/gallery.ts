
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

export const buildGalleryGenerationPrompt = (
    ctx: PromptContext
) => {
    const { eraLabelForTitlePrompt, worldviewLabelKoreanPart, modernTechBan } = generateWorldviewSpecificInstructions(
        ctx.worldviewValue, 
        ctx.customWorldviewText, 
        ctx.worldviewEraValue
    );
    const { temperature, selectedToxicity } = generateToxicitySpecificInstructions(ctx.toxicityLevelValue);
    const toxicityNameForTitle = selectedToxicity.nameForTitle;

    let googleSearchInstruction = "";
    let jsonFormattingInstruction = "";

    if (ctx.useSearch) {
        googleSearchInstruction = `
    [TOOL USE: GOOGLE SEARCH]
    - Use Google Search to find REAL trending news/memes about "${ctx.topic}" in Korea.
    - Integrate these findings into the generated posts to make them feel "live" and "current".
    - Do NOT output markdown links. Just weave the information into the user chatter (e.g., "Did you see the news about X?").
        `;

        // If using Search, we can't use responseSchema reliably in some contexts, so we enforce JSON via prompt.
        jsonFormattingInstruction = `
    **5. JSON OUTPUT SPECIFICATION (STRICT)**
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
    if (modernTechBan) {
        explicitTechBanInstruction = `
    **CRITICAL SECURITY CHECK - ERA COMPLIANCE:**
    - You are simulating a PRE-MODERN era.
    - **VERIFY:** Scan your generated text for words like "Phone", "Camera", "App", "Internet", "Car", "Screen".
    - **ACTION:** If found, REPLACE them with era-appropriate alternatives (e.g., "Drawing", "Scroll", "Horse", "Window").
    - **DO NOT** create a scenario where characters are using modern devices to post. They are communicating through the 'ether' or magic, but their *physical* reality is ancient.
        `;
    }

    const prompt = `
    **TASK: Generate the initial page of the "${ctx.topic}" Gallery.**

    **1. DYNAMIC CONTEXT**
    - **Current Burning Issue (떡밥):** "${ctx.discussionContext || 'General daily chatter'}"
    ${googleSearchInstruction}

    **2. GENERATION REQUIREMENTS**
    - Generate EXACTLY ${NUMBER_OF_POSTS} posts.
    - **Post 1 (Best Post/Concept Text):** High engagement, ${MIN_COMMENTS_PER_BEST_POST}-${MAX_COMMENTS_PER_BEST_POST} comments. This should be the "legendary" post of the day - funny, insightful, or controversial.
    - **Posts 2-${NUMBER_OF_POSTS}:** Regular posts (${MIN_COMMENTS_PER_POST}-${MAX_COMMENTS_PER_POST} comments). varied topics (questions, shitposts, news sharing).
    
    **3. GALLERY TITLE FORMAT**
    - Use this format for the 'galleryTitle' field: "[${ctx.topic}] 갤러리 - ${worldviewLabelKoreanPart}${eraLabelForTitlePrompt ? ` (${eraLabelForTitlePrompt})` : ''} - [${toxicityNameForTitle}]"

    **4. CONTENT GUIDELINES**
    - **Reply Logic:** In comments, use "@Nickname " to reply. The nickname MUST exist in the generated thread.
    - **Media Usage:** Randomly include (사진: ...), (동영상: ...) in post content to make it feel alive. 
      - **CRITICAL:** Ensure the *content* of the photo/video matches the Worldview (e.g. Ancient Murim = "A drawing of a sword", NOT "A selfie with a phone").
      - Use (콘: ...) in comments for reactions.
    
    ${explicitTechBanInstruction}

    ${jsonFormattingInstruction}
  `;

    return { prompt, temperature };
};
