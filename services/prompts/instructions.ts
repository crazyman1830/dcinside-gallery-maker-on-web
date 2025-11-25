
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
    // 1. Resolve Worldview Label & Description
    const selectedWorldview = WORLDVIEW_OPTIONS.find(wv => wv.value === worldviewValue);
    const worldviewLabelKoreanPart = selectedWorldview ? selectedWorldview.label.split(" (")[0] : worldviewValue;
    
    let worldviewDesc = "";
    if (worldviewValue === CUSTOM_WORLDVIEW_VALUE) {
        worldviewDesc = `**Core Worldview:** Custom\nDetails: "${customWorldviewText || 'Unique world'}"`;
    } else if (worldviewValue === "MURIM") {
        worldviewDesc = `**Core Worldview:** Murim (Martial Arts)\nContext: Jianghu, Sects, Qi, Martial Arts. Characters traditionally use archaic tone (Haoche) but should adapt to the selected Era.`;
    } else if (worldviewValue === "FANTASY") {
        worldviewDesc = `**Core Worldview:** Western Fantasy\nContext: Magic, Dungeons, Non-human races.`;
    } else {
        worldviewDesc = `**Core Worldview:** Earth (Standard Reality)`;
    }

    // 2. Resolve Era Description & Tech Constraints
    const currentEraValue = worldviewEraValue || DEFAULT_WORLDVIEW_ERA;
    const selectedEra = WORLDVIEW_ERA_OPTIONS.find(era => era.value === currentEraValue) || WORLDVIEW_ERA_OPTIONS.find(era => era.value === DEFAULT_WORLDVIEW_ERA)!;
    const eraLabelForTitlePrompt = selectedEra.label.split(" (")[0];

    let eraDesc = "";
    let eraConstraints = "";

    switch (currentEraValue) {
        case "PREHISTORIC":
            eraDesc = "Stone Age (Pre-Civilization). Hunter-gatherer society.";
            eraConstraints = "STRICTLY PROHIBITED: Metal, Writing, Wheels, Farming, Architecture beyond caves/huts. REPLACEMENT: 'House'->'Cave', 'Weapon'->'Stone/Club', 'Clothing'->'Fur'.";
            break;
        case "ANCIENT":
            eraDesc = "Ancient Era (Bronze/Iron Age). Early Empires.";
            eraConstraints = "STRICTLY PROHIBITED: Gunpowder, Printing Press, Engines, Electricity, Plastic. REPLACEMENT: 'Car'->'Chariot/Horse', 'Paper'->'Scroll/Tablet'.";
            break;
        case "MEDIEVAL":
            eraDesc = "Medieval Era (Feudalism). Swords and cold weapons.";
            eraConstraints = "STRICTLY PROHIBITED: Guns/Rifles (unless primitive cannons), Steam Engines, Electricity, Plastic, Cars, Trucks, Smartphones, Internet. REPLACEMENT: 'Truck'->'Wagon/Cart', 'Car'->'Carriage', 'Phone'->'Letter/Magic Stone', 'Internet'->'Town Square'.";
            break;
        case "EARLY_MODERN":
            eraDesc = "Early Modern (19th - Early 20th Century). Steam & Steel, Industrial Revolution.";
            eraConstraints = "STRICTLY PROHIBITED: Digital Computers, Microchips, Internet, Smartphones, Nuclear Power. REPLACEMENT: 'Internet'->'Newspaper/Telegram', 'Smartphone'->'Pocket Watch/Notebook', 'Blog'->'Journal'.";
            break;
        case "CONTEMPORARY":
            eraDesc = "Modern Day (21st Century). Information Age.";
            eraConstraints = "Standard modern technology allowed.";
            break;
        case "NEAR_FUTURE":
            eraDesc = "Near Future (Cyberpunk/High-Tech).";
            eraConstraints = "Must include advanced tech (AI, cybernetics, holograms).";
            break;
        case "FAR_FUTURE":
            eraDesc = "Far Future (Space Age).";
            eraConstraints = "Must include futuristic tech (Warp drives, Energy shields, Teleporters).";
            break;
        default:
             eraDesc = "Modern Day.";
             eraConstraints = "";
    }

    // 3. Combine Instructions
    const worldviewSpecificInstructions = `
**SETTING CONFIGURATION**
- ${worldviewDesc}
- **Time Period:** ${eraDesc}
- **Fusion Directive:** Blend the Core Worldview with the Time Period. 
  - Example 1: Murim + Cyberpunk = Neo-Murim with laser swords and Qi-chips.
  - Example 2: Fantasy + Modern = Urban Fantasy (Elves in suits).
  - Example 3: Earth + Ancient = Historical Drama.
- **ANACHRONISM CHECK (CRITICAL):**
  - ${eraConstraints}
  - **Rule:** If the user's Topic (e.g. "Truck") violates the time period (e.g. Medieval), YOU MUST ADAPT IT to an era-appropriate equivalent (e.g. "Oxcart") instead of using the modern word.
`;

    return { worldviewSpecificInstructions, eraLabelForTitlePrompt, selectedWorldview, worldviewLabelKoreanPart, eraConstraints };
};

export const generateToxicitySpecificInstructions = (toxicityLevelValue: string) => {
    const selectedToxicity = TOXICITY_LEVEL_OPTIONS.find(tl => tl.value === toxicityLevelValue) || TOXICITY_LEVEL_OPTIONS.find(tl => tl.value === DEFAULT_TOXICITY_LEVEL)!;
    let toxicitySpecificInstructions = "";

    // Gemini 3 optimization: Removed variable temperature suggestions. Focused on direct instructions.
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
