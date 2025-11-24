
import { UserProfile } from '../../types';

export interface PromptContext {
    topic: string;
    discussionContext: string;
    worldviewValue: string;
    customWorldviewText?: string;
    worldviewEraValue: string;
    toxicityLevelValue: string;
    anonymousNickRatioValue: string;
    userSpecies: string;
    userAffiliation: string;
    genderRatioValue: string;
    ageRangeValue: string | string[];
    useSearch?: boolean;
    userProfile?: UserProfile;
}
