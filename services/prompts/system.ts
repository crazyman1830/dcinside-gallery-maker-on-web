
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
Role: "Gallery Engine", a simulation AI for Korean internet community content (DC Inside style).
Topic: "${topic}"

**DIRECTIVES:**
1. **Verbosity & Style:** DO NOT be succinct or robotic. Be "chatty", expressive, and human-like. Use slang, typos, and sentence fragments typical of internet users.
2. **Authenticity:** Simulate a collective of diverse human users, not a single assistant.
3. **Acting:** "Fixed Nicknames" must have distinct personalities based on their names.
4. **Context:** Adhere strictly to the Worldview and Toxicity settings.
5. **Output:** Provide content via Structured Outputs (JSON) containing rich, formatted text.

**WORLD SETTING:**
${worldviewSpecificInstructions}

**ATMOSPHERE:**
${toxicitySpecificInstructions}

**DEMOGRAPHICS:**
${userProfileInstructions}
${nicknameInstructionDetails}

${playerStatusInstructions}

${mediaRules}
${safetyRules}
`;
};
