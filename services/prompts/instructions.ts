
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
    let modernTechBan = false; // Flag to indicate if modern tech should be explicitly banned in the user prompt
    const worldviewLabelKoreanPart = selectedWorldview ? selectedWorldview.label.split(" (")[0] : worldviewValue;

    if (selectedWorldview && selectedWorldview.value === CUSTOM_WORLDVIEW_VALUE) {
        worldviewSpecificInstructions = `
**Worldview: Custom - "${worldviewLabelKoreanPart}"**
User Description: "${customWorldviewText || 'No custom description provided. Assume a generic unique world.'}"

**INSTRUCTION:** Immerse yourself completely in this custom world.
- Deduce the technological level, social hierarchy, and slang from the user's description.
- If the description implies magic, speak like a mage/commoner of that world. If sci-fi, use techno-babble.
- The 'worldviewEraValue' is effectively overridden by this custom description.
`;
        eraLabelForTitlePrompt = "";
        modernTechBan = false; // Depends on user input, so we can't force ban
    } else if (selectedWorldview && selectedWorldview.value === "MURIM") {
        worldviewSpecificInstructions = `
**Worldview: Murim (Martial Arts World)**
- **TIME PERIOD:** Ancient/Medieval East Asian Era (Pre-Industrial). 100% PRE-MODERN.
- **PHYSICAL REALITY (STRICT):** 
    - **Architecture:** Wooden pagodas, tiled roofs, dirt roads, inns (Jumak), mountain sects.
    - **Transport:** Horses, carriages, walking, Qinggong (flying/leaping).
    - **Items:** Swords, spears, brushes, ink, paper, tea sets, jade, alcohol jars, silver taels, torches, candles.
- **ABSOLUTE PROHIBITION (VIOLATION = FAILURE):**
    - **NO MODERN TECH:** No smartphones, computers, internet, cars, guns, plastic, concrete, sneakers, glasses, watches.
    - **NO MODERN CONCEPTS:** No "uploading", "streaming", "files", "app", "camera", "selfie", "video call".
- **CONCEPTUAL TRANSLATION (How to handle the "Gallery" format):** 
    - The characters are living in the ancient world. They are speaking, shouting, writing on scrolls, or using telepathy (Jeoneum).
    - **YOU** (The AI) are translating their interactions into the *visual format* of a modern forum for the user's amusement.
    - **CRITICAL:** When describing the *content* of a post (especially "Photo" or "Video" descriptions), describe **ONLY** what exists in that era.
        - **BAD:** "(Photo: A selfie of me holding a sword)" -> INVALID (No phones).
        - **GOOD:** "(Photo: A rough ink drawing of a sword)" or "(Photo: A view of the Mount Hua sect entrance)".
        - **BAD:** "(Video: Dashcam footage of a horse accident)" -> INVALID.
        - **GOOD:** "(Video: A visual memory of a horse crashing into a cart)".
- **Atmosphere:** A chaotic blend of ancient martial arts honor codes and modern internet cynicism.
- **Speech Style:** Mix archaic Korean martial arts terms (본좌, 소협, 주화입마, 하오체, 비급) with modern internet slang.
`;
        eraLabelForTitlePrompt = "";
        modernTechBan = true;
    } else if (selectedWorldview && selectedWorldview.value === "FANTASY") {
        worldviewSpecificInstructions = `
**Worldview: Western Fantasy**
- **TIME PERIOD:** Medieval High Fantasy Era. 100% PRE-MODERN.
- **PHYSICAL REALITY (STRICT):**
    - **Architecture:** Castles, stone villages, dungeons, taverns, guilds, wizard towers.
    - **Transport:** Horses, carriages, teleportation circles, airships (steampunk/magic only).
    - **Items:** Swords, staffs, potions, scrolls, armor, gold coins, crystals.
- **ABSOLUTE PROHIBITION (VIOLATION = FAILURE):**
    - **NO MODERN TECH:** No electricity, internet, cars, phones, guns, plastic, modern fashion.
    - **NO MODERN CONCEPTS:** No "downloading", "texting", "social media", "screen".
- **CONCEPTUAL TRANSLATION:**
    - The characters are interacting via magic crystals, bulletin boards, or psychic links.
    - **YOU** convert these interactions into a forum layout.
    - **CRITICAL:** Content descriptions must match the era.
        - **BAD:** "(Photo: My new gaming PC setup)" -> INVALID.
        - **GOOD:** "(Photo: My new alchemical lab setup)".
- **Atmosphere:** A world of Magic, Monsters, and Adventurers, but treated like a mundane job market or hobby.
- **Speech Style:** Fantasy terminology used in casual slang.
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
                worldviewSpecificInstructions += `- **Theme:** Survival, hunting, fire. **Technology:** Stone tools. No metal, no electricity. Speak simply.`; 
                modernTechBan = true;
                break;
            case "ANCIENT": 
                worldviewSpecificInstructions += `- **Theme:** Rome/Greece/Egypt. Slaves vs Masters, Gods. No electricity or engines.`; 
                modernTechBan = true;
                break;
            case "MEDIEVAL": 
                worldviewSpecificInstructions += `- **Theme:** Feudalism, Plague, Kings. No modern tech.`; 
                modernTechBan = true;
                break;
            case "EARLY_MODERN": 
                worldviewSpecificInstructions += `- **Theme:** Revolution, Discovery, Steam. Early industry. No digital tech.`; 
                modernTechBan = true;
                break;
            case "CONTEMPORARY": 
                worldviewSpecificInstructions += `- **Theme:** Modern 21st Century Korea. Smartphones, K-Pop, Politics. **Hyper-realism required.**`; 
                modernTechBan = false;
                break;
            case "NEAR_FUTURE": 
                worldviewSpecificInstructions += `- **Theme:** Cyberpunk-lite, AI, Climate. High tech, low life.`; 
                modernTechBan = false;
                break;
            case "FAR_FUTURE": 
                worldviewSpecificInstructions += `- **Theme:** Space travel, Aliens, Post-human. Galactic scale.`; 
                modernTechBan = false;
                break;
            default: 
                worldviewSpecificInstructions += `- **Theme:** Modern day default.`; 
                modernTechBan = false;
                break;
        }
    }
    return { worldviewSpecificInstructions, eraLabelForTitlePrompt, selectedWorldview, worldviewLabelKoreanPart, modernTechBan };
};

export const generateToxicitySpecificInstructions = (toxicityLevelValue: string) => {
    const selectedToxicity = TOXICITY_LEVEL_OPTIONS.find(tl => tl.value === toxicityLevelValue) || TOXICITY_LEVEL_OPTIONS.find(tl => tl.value === DEFAULT_TOXICITY_LEVEL)!;
    let toxicitySpecificInstructions = "";
    let temperature = 0.95;

    switch (selectedToxicity.value) {
        case "MILD":
            temperature = 0.85;
            toxicitySpecificInstructions = `
**Toxicity Level: MILD (순한맛)**
- **Tone:** Polite, clean, "Cleanbot" style.
- **Banned:** Profanity, aggressive insults, sexual harassment.
- **Allowed:** Gentle sarcasm, puns, wholesome support.
- **Vibe:** A strictly moderated hobbyist forum.
`;
            break;
        case "SPICY":
            temperature = 1.0;
            toxicitySpecificInstructions = `
**Toxicity Level: SPICY (매운맛)**
- **Tone:** Aggressive, raw, unfiltered, "DCInside Deep Gallery" style.
- **Required:** Creative insults, satire, heavy slang, provocative phrasing.
- **Note:** Do not just use swear words randomly. Use them to emphasize frustration, mockery, or intense emotion authentic to the community.
- **Vibe:** A lawless wasteland where strength (or wit) rules.
`;
            break;
        case "MEDIUM":
        default:
            temperature = 0.95;
            toxicitySpecificInstructions = `
**Toxicity Level: MEDIUM (보통맛)**
- **Tone:** Casual, blunt, standard internet community.
- **Allowed:** Mild swearing (ㅅㅂ, 미친), slang, friendly teasing.
- **Vibe:** Typical noisy internet forum.
`;
            break;
    }
    return { toxicitySpecificInstructions, temperature, selectedToxicity };
};

export const generateUserProfileInstructions = (
    userSpecies: string,
    userAffiliation: string,
    genderRatioValue: string,
    ageRangeValue: string | string[]
) => {
    let instructions = `**User Demographics & Persona (General Population):**\n`;
    
    if (userSpecies) instructions += `- **Species:** ${userSpecies}. (Reflect biological/cultural traits in text)\n`;
    if (userAffiliation) instructions += `- **Affiliation:** ${userAffiliation}. (Bias towards this group)\n`;

    if (genderRatioValue !== GENDER_RATIO_AUTO_ID) {
        instructions += `- **Gender Balance:** ${genderRatioValue}% Male. Adjust 'Hyung/Oppa/Unni/Noona' terminology accordingly.\n`;
    }
    
    if (Array.isArray(ageRangeValue) && ageRangeValue.length > 0) {
        const labels = AGE_RANGE_OPTIONS.filter(o => ageRangeValue.includes(o.value)).map(o => o.label).join(', ');
        instructions += `- **Age Group:** ${labels}. Use slang appropriate for this generation.\n`;
    }

    return instructions;
};

export const getNicknameInstructionDetails = (anonymousNickRatioValue: string) => {
    const ratioOption = ANONYMOUS_NICK_RATIO_OPTIONS.find(opt => opt.value === anonymousNickRatioValue) || ANONYMOUS_NICK_RATIO_OPTIONS.find(opt => opt.value === DEFAULT_ANONYMOUS_NICK_RATIO)!;
    
    return `
**Nickname Protocol:**
- **Ratio:** ${ratioOption.label}.
- **Fixed Nicks (고정닉):** Creative, thematic names in **KOREAN (Hangul)**.
  - **CONCEPT & PERSONA (CRITICAL):** The nickname MUST dictate the speech style and personality.
  - *Example:* '젠틀맨' -> Speaks extremely politely, perhaps sarcastically so.
  - *Example:* '광전사' -> Uses short sentences, aggressive tone, exclamation marks.
  - *Example:* '팩트폭격기' -> Obsessed with facts, dry tone, annoying.
  - *Example:* '냥냥이' -> Ends sentences with '~nyang' or uses cute emojis.
- **Fluid Nicks (유동닉):** MUST use format "ㅇㅇ(IP)". Generally cynical, raw, unfiltered, and follow the 'hive mind' of the gallery.
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
        statusDescription = "PUBLIC ENEMY / VILLAIN. The community HATES this user. Replies should be hostile, insulting, or mocking. Downvotes are common.";
    } else if (reputation <= 40) {
        statusDescription = "UNPOPULAR. Users are dismissive or annoyed by this user. They treat them as a nuisance.";
    } else if (reputation <= 60) {
        statusDescription = "NEUTRAL / INVISIBLE. Users treat this user normally. Standard engagement.";
    } else if (reputation <= 80) {
        statusDescription = "POPULAR / LIKED. Users are friendly and supportive. They generally agree or engage positively.";
    } else {
        statusDescription = "IDOL / GALLERY LEGEND. Users worship or highly respect this user. They seek validation from them and defend them.";
    }

    return `
**CURRENT PLAYER STATUS:**
The active user interacting with the gallery is: **"${fullNickname}"**
- **Reputation Score:** ${reputation}/100.
- **Community Stance:** ${statusDescription}
- **INSTRUCTION:** When generating comments or reactions to THIS specific user, strictly follow this reputation setting.
`;
};
