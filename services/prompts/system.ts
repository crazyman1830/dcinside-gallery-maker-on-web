
import { PromptContext } from './context';
import { getMediaFormattingRules, getSafetyRules, getImmersionRules } from './rules';
import {
    generateWorldviewSpecificInstructions,
    generateToxicitySpecificInstructions,
    generateUserProfileInstructions,
    getNicknameInstructionDetails,
    generatePlayerStatusInstructions
} from './instructions';

export const SYSTEM_INSTRUCTION_VERSION = "2.3.0";

export const buildSystemInstruction = (
    topic: string,
    galleryContext: PromptContext
) => {
    const { worldviewSpecificInstructions } = generateWorldviewSpecificInstructions(
        galleryContext.worldviewValue, 
        galleryContext.customWorldviewText, 
        galleryContext.worldviewEraValue
    );
    const { toxicitySpecificInstructions } = generateToxicitySpecificInstructions(galleryContext.toxicityLevelValue);
    const userProfileInstructions = generateUserProfileInstructions(
        galleryContext.userSpecies, 
        galleryContext.userAffiliation, 
        galleryContext.genderRatioValue, 
        galleryContext.ageRangeValue
    );
    const nicknameInstructionDetails = getNicknameInstructionDetails(galleryContext.anonymousNickRatioValue);
    const playerStatusInstructions = generatePlayerStatusInstructions(galleryContext.userProfile);
    const mediaRules = getMediaFormattingRules();
    const immersionRules = getImmersionRules();
    const safetyRules = getSafetyRules();

    return `
// SYSTEM INSTRUCTION VERSION: ${SYSTEM_INSTRUCTION_VERSION}
Role: "Gallery Engine", a simulation AI for Korean internet community content (DC Inside style).
Topic: "${topic}"

**DIRECTIVES (CRITICAL):**
1. **Verbosity & Style:** DO NOT be succinct or robotic. You must act as a **Hyper-Chatty, Expressive, and Chaotic** community of users. Use slang, typos, sentence fragments, and emotional outbursts typical of internet users.
2. **Authenticity:** Simulate a collective of diverse human users, not a single assistant. Do not use bullet points or structured lists for comment text; use natural spoken language.
3. **No Explanations:** **NEVER** explain jargon in parentheses (e.g., "BD(BrainDance)" is FORBIDDEN). Just say "BD". Treat the user as an insider who knows everything.
4. **Acting:** "Fixed Nicknames" must have distinct personalities based on their names.
5. **Context:** Adhere strictly to the Worldview and Toxicity settings.
6. **Output:** Provide content via Structured Outputs (JSON) containing rich, formatted text.
7. **Safety:** STRICTLY adhere to the 'Safety & Content Protocols'. **Silent Correction** is mandatory. You must NOT output meta-commentary about your corrections.

**WORLD SETTING:**
${worldviewSpecificInstructions}

**ATMOSPHERE:**
${toxicitySpecificInstructions}

**DEMOGRAPHICS:**
${userProfileInstructions}
${nicknameInstructionDetails}

${playerStatusInstructions}

${mediaRules}
${immersionRules}
${safetyRules}
`;
};
