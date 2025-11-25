
import { UserProfile } from '../../types';
import {
    WORLDVIEW_OPTIONS,
    WORLDVIEW_ERA_OPTIONS,
    DEFAULT_WORLDVIEW_ERA,
    CUSTOM_WORLDVIEW_VALUE,
    TOXICITY_LEVEL_OPTIONS,
    DEFAULT_TOXICITY_LEVEL,
    ANONYMOUS_NICK_RATIO_OPTIONS,
    DEFAULT_ANONYMOUS_NICK_RATIO,
    GENDER_RATIO_AUTO_ID,
    AGE_RANGE_OPTIONS,
} from '../../formOptions';

export const generateWorldviewSpecificInstructions = (
    worldviewValue: string,
    customWorldviewText: string | undefined,
    worldviewEraValue: string
) => {
    const selectedWorldview = WORLDVIEW_OPTIONS.find(wv => wv.value === worldviewValue);
    let worldviewSpecificInstructions = "";
    let eraLabelForTitlePrompt = "";
    let modernTechBan = false;
    const worldviewLabelKoreanPart = selectedWorldview ? selectedWorldview.label.split(" (")[0] : worldviewValue;

    if (selectedWorldview && selectedWorldview.value === CUSTOM_WORLDVIEW_VALUE) {
        worldviewSpecificInstructions = `
**Worldview: Custom - "${worldviewLabelKoreanPart}"**
User Description: "${customWorldviewText || 'Generic unique world.'}"
**DIRECTIVE:** Completely adopt this custom world's logic, tech level, and slang.
`;
        eraLabelForTitlePrompt = "";
        modernTechBan = false;
    } else if (selectedWorldview && selectedWorldview.value === "MURIM") {
        worldviewSpecificInstructions = `
**Worldview: Murim (Martial Arts)**
- **Era:** Pre-modern Ancient East Asia.
- **Strict Constraint:** NO modern technology (phones, cars, internet terms).
- **Translation Layer:** Characters speak in archaic martial arts tone (Haoche, etc.), but you present it as a web forum format.
- **Content:** Images/Videos must be described as drawings or visual memories, not digital files.
`;
        eraLabelForTitlePrompt = "";
        modernTechBan = true;
    } else if (selectedWorldview && selectedWorldview.value === "FANTASY") {
        worldviewSpecificInstructions = `
**Worldview: Western Fantasy**
- **Era:** Medieval High Fantasy.
- **Strict Constraint:** NO electricity or digital tech. Magic crystals/scrolls replace screens.
- **Content:** Images must be described as paintings, scrying orb visions, or sketches.
`;
        eraLabelForTitlePrompt = "";
        modernTechBan = true;
    } else {
        const currentEraValue = worldviewEraValue;
        const selectedEraOption = WORLDVIEW_ERA_OPTIONS.find(era => era.value === currentEraValue) || WORLDVIEW_ERA_OPTIONS.find(era => era.value === DEFAULT_WORLDVIEW_ERA)!;
        eraLabelForTitlePrompt = selectedEraOption.label.split(" (")[0];

        worldviewSpecificInstructions = `**Worldview: Earth (${selectedEraOption.label})**\n`;

        switch (currentEraValue) {
            case "PREHISTORIC": 
                worldviewSpecificInstructions += `- **Theme:** Stone age survival. Speak simply. No metal/tech.`; 
                modernTechBan = true;
                break;
            case "ANCIENT": 
                worldviewSpecificInstructions += `- **Theme:** Ancient civilization (Rome/Egypt). No engines.`; 
                modernTechBan = true;
                break;
            case "MEDIEVAL": 
                worldviewSpecificInstructions += `- **Theme:** Feudalism. No modern tech.`; 
                modernTechBan = true;
                break;
            case "EARLY_MODERN": 
                worldviewSpecificInstructions += `- **Theme:** Steam/Industrial revolution. Early industry.`; 
                modernTechBan = true;
                break;
            case "CONTEMPORARY": 
                worldviewSpecificInstructions += `- **Theme:** 21st Century Korea. Hyper-realistic modern slang allowed.`; 
                modernTechBan = false;
                break;
            case "NEAR_FUTURE": 
                worldviewSpecificInstructions += `- **Theme:** Cyberpunk-lite. High tech, low life.`; 
                modernTechBan = false;
                break;
            case "FAR_FUTURE": 
                worldviewSpecificInstructions += `- **Theme:** Space/Galactic.`; 
                modernTechBan = false;
                break;
            default: 
                worldviewSpecificInstructions += `- **Theme:** Modern day.`; 
                modernTechBan = false;
                break;
        }
    }
    return { worldviewSpecificInstructions, eraLabelForTitlePrompt, selectedWorldview, worldviewLabelKoreanPart, modernTechBan };
};

export const generateToxicitySpecificInstructions = (toxicityLevelValue: string) => {
    const selectedToxicity = TOXICITY_LEVEL_OPTIONS.find(tl => tl.value === toxicityLevelValue) || TOXICITY_LEVEL_OPTIONS.find(tl => tl.value === DEFAULT_TOXICITY_LEVEL)!;
    let toxicitySpecificInstructions = "";

    // Gemini 3 prefers text instructions over temperature for style control.
    switch (selectedToxicity.value) {
        case "MILD":
            toxicitySpecificInstructions = `
**Toxicity: MILD (순한맛)**
- **Tone:** Polite, wholesome, "Cleanbot" active.
- **Rule:** NO profanity, aggressive insults, or sexual harassment.
- **Style:** Friendly hobbyist community.
`;
            break;
        case "SPICY":
            toxicitySpecificInstructions = `
**Toxicity: SPICY (매운맛)**
- **Tone:** Aggressive, raw, unfiltered, cynical.
- **Rule:** Use creative insults, satire, and heavy slang authentic to "DC Inside".
- **Style:** A lawless wasteland. Be provocative.
`;
            break;
        case "MEDIUM":
        default:
            toxicitySpecificInstructions = `
**Toxicity: MEDIUM (보통맛)**
- **Tone:** Casual, blunt, standard internet banter.
- **Rule:** Mild swearing allowed (e.g., shit, damn) but no hate speech.
- **Style:** Typical noisy forum.
`;
            break;
    }
    return { toxicitySpecificInstructions, selectedToxicity };
};

export const generateUserProfileInstructions = (
    userSpecies: string,
    userAffiliation: string,
    genderRatioValue: string,
    ageRangeValue: string | string[]
) => {
    let instructions = `**Demographics & Persona:**\n`;
    
    if (userSpecies) instructions += `- **Species:** ${userSpecies}\n`;
    if (userAffiliation) instructions += `- **Affiliation:** ${userAffiliation}\n`;

    if (genderRatioValue !== GENDER_RATIO_AUTO_ID) {
        instructions += `- **Gender:** ${genderRatioValue}% Male context.\n`;
    }
    
    if (Array.isArray(ageRangeValue) && ageRangeValue.length > 0) {
        const labels = AGE_RANGE_OPTIONS.filter(o => ageRangeValue.includes(o.value)).map(o => o.label).join(', ');
        instructions += `- **Age Group:** ${labels}. Use appropriate generational slang.\n`;
    }

    return instructions;
};

export const getNicknameInstructionDetails = (anonymousNickRatioValue: string) => {
    const ratioOption = ANONYMOUS_NICK_RATIO_OPTIONS.find(opt => opt.value === anonymousNickRatioValue) || ANONYMOUS_NICK_RATIO_OPTIONS.find(opt => opt.value === DEFAULT_ANONYMOUS_NICK_RATIO)!;
    
    return `
**Nickname Protocol:**
- **Distribution:** ${ratioOption.label}
- **Fixed Nicks (고정닉):** The nickname MUST define the persona (e.g., 'AngryWarrior' -> writes angrily).
- **Fluid Nicks (유동닉):** Use format "ㅇㅇ(IP)". Tone is generally cynical/hive-mind.
`;
};

export const generatePlayerStatusInstructions = (userProfile?: UserProfile) => {
    if (!userProfile) return "";

    const { nickname, reputation } = userProfile;
    const fullNickname = userProfile.nicknameType === 'ANONYMOUS' && userProfile.ip 
        ? `${nickname}${userProfile.ip}` 
        : nickname;

    let statusDescription = "";
    if (reputation <= 20) {
        statusDescription = "VILLAIN (Hated). Replies should be hostile/mocking.";
    } else if (reputation <= 40) {
        statusDescription = "UNPOPULAR (Annoying). Users are dismissive.";
    } else if (reputation <= 60) {
        statusDescription = "NEUTRAL. Standard engagement.";
    } else if (reputation <= 80) {
        statusDescription = "POPULAR. Users are friendly/agreeable.";
    } else {
        statusDescription = "LEGEND/IDOL. Users worship and defend this user.";
    }

    return `
**Current User Context:**
- **User:** "${fullNickname}"
- **Status:** ${statusDescription}
- **Action:** React to this specific user according to their status.
`;
};
