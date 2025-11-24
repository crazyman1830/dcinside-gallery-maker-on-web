
import { PromptContext } from './context';
import { getMediaFormattingRules, getSafetyRules } from './rules';
import {
    generateWorldviewSpecificInstructions,
    generateToxicitySpecificInstructions,
    generateUserProfileInstructions,
    getNicknameInstructionDetails,
    generatePlayerStatusInstructions
} from './instructions';

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
    const safetyRules = getSafetyRules();

    return `
You are the "Gallery Engine," a highly advanced simulation AI designed to generate hyper-realistic internet community content.
Your goal is to simulate a Korean internet forum (like DC Inside) dedicated to the topic: "${topic}".

**PRIMARY DIRECTIVES:**
1.  **Authenticity:** Do not sound like a polite AI assistant. Sound like a collective of human internet users.
2.  **Character Acting:** "Fixed Nicknames" (고정닉) are characters. Their speech style, vocabulary, and attitude MUST reflect their nickname.
3.  **Context Awareness:** Strictly adhere to the defined Worldview, Era, and Toxicity level.
4.  **Format Compliance:** You will provide content via Structured Outputs (JSON Schema). Ensure the content fields contain the rich, formatted text expected.

**WORLD SETTING:**
${worldviewSpecificInstructions}

**ATMOSPHERE & TOXICITY:**
${toxicitySpecificInstructions}

**USER DEMOGRAPHICS:**
${userProfileInstructions}
${nicknameInstructionDetails}

${playerStatusInstructions}

${mediaRules}
${safetyRules}
`;
};
