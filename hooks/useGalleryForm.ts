
// FIX: Import React to provide the React namespace for types like React.ChangeEvent.
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    WORLDVIEW_OPTIONS,
    WORLDVIEW_ERA_OPTIONS,
    DEFAULT_WORLDVIEW_ERA,
    WORLDVIEW_ERA_NOT_APPLICABLE,
    TOXICITY_LEVEL_OPTIONS,
    DEFAULT_TOXICITY_LEVEL,
    ANONYMOUS_NICK_RATIO_OPTIONS,
    DEFAULT_ANONYMOUS_NICK_RATIO,
    GENDER_RATIO_AUTO_ID,
    AGE_RANGE_OPTIONS,
    DEFAULT_AGE_RANGE,
    MAX_USER_SPECIES_LENGTH,
    MAX_USER_AFFILIATION_LENGTH,
    CUSTOM_WORLDVIEW_VALUE,
    MAX_CUSTOM_WORLDVIEW_LENGTH
} from '../formOptions';
import { GalleryFormSettings, UserNicknameType } from '../types';
import { GEMINI_MODEL_TEXT, GEMINI_MODEL_PRO, GEMINI_MODEL_3_PRO } from '../constants';
import { generateRandomIp } from '../utils/common';

export interface GalleryFormValidationErrors {
    topic?: string;
    discussionContext?: string;
    customWorldviewText?: string; 
    userSpecies?: string;
    userAffiliation?: string;
    fixedNickname?: string;
}

export const useGalleryForm = (initialState?: Partial<GalleryFormSettings>) => {
    const [topic, setTopic] = useState<string>(initialState?.topic || '');
    const [discussionContext, setDiscussionContext] = useState<string>(initialState?.discussionContext || '');
    const [selectedWorldview, setSelectedWorldview] = useState<string>(initialState?.selectedWorldview || WORLDVIEW_OPTIONS[0].value);
    const [customWorldviewText, setCustomWorldviewText] = useState<string>(initialState?.customWorldviewText || '');
    const [selectedWorldviewEra, setSelectedWorldviewEra] = useState<string>(initialState?.selectedWorldviewEra || DEFAULT_WORLDVIEW_ERA);
    const [selectedToxicityLevel, setSelectedToxicityLevel] = useState<string>(initialState?.selectedToxicityLevel || DEFAULT_TOXICITY_LEVEL);
    const [selectedAnonymousNickRatio, setSelectedAnonymousNickRatio] = useState<string>(initialState?.selectedAnonymousNickRatio || DEFAULT_ANONYMOUS_NICK_RATIO);

    const [userSpecies, setUserSpecies] = useState<string>(initialState?.userSpecies || '');
    const [userAffiliation, setUserAffiliation] = useState<string>(initialState?.userAffiliation || '');
    const [isManualGenderRatio, setIsManualGenderRatio] = useState<boolean>(initialState?.isManualGenderRatio || false);
    const [manualMalePercentage, setManualMalePercentage] = useState<number>(initialState?.manualMalePercentage || 50);

    const [isManualAgeRange, setIsManualAgeRange] = useState<boolean>(initialState?.isManualAgeRange || false);
    const [manualSelectedAgeGroups, setManualSelectedAgeGroups] = useState<Set<string>>(
        initialState?.manualSelectedAgeGroups ? new Set(initialState.manualSelectedAgeGroups) : new Set()
    );

    const [isQualityUpgradeUnlocked, setIsQualityUpgradeUnlocked] = useState<boolean>(initialState?.isQualityUpgradeUnlocked !== undefined ? initialState.isQualityUpgradeUnlocked : true); 
    const [isQualityUpgradeEnabled, setIsQualityUpgradeEnabled] = useState<boolean>(initialState?.isQualityUpgradeEnabled || false);
    const [isSearchEnabled, setIsSearchEnabled] = useState<boolean>(initialState?.isSearchEnabled || false);
    const [selectedModel, setSelectedModel] = useState<string>(initialState?.selectedModel || GEMINI_MODEL_3_PRO);

    // User Profile State
    const [userNicknameType, setUserNicknameType] = useState<UserNicknameType>(initialState?.userNicknameType || 'ANONYMOUS');
    const [fixedNickname, setFixedNickname] = useState<string>(initialState?.fixedNickname || '');
    const [userReputation, setUserReputation] = useState<number>(initialState?.userReputation !== undefined ? initialState.userReputation : 50);
    const [generatedIp, setGeneratedIp] = useState<string>('');

    const [errors, setErrors] = useState<GalleryFormValidationErrors>({});
    
    useEffect(() => {
        // Initialize random IP
        setGeneratedIp(generateRandomIp());
    }, []);

    const handleWorldviewChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const newWorldview = e.target.value;
        setSelectedWorldview(newWorldview);
        
        // If the era was set to "Not Applicable" (empty) from a previous preset/state, reset it to default
        // to ensure the user sees a valid era option when switching.
        if (selectedWorldviewEra === WORLDVIEW_ERA_NOT_APPLICABLE) {
            setSelectedWorldviewEra(DEFAULT_WORLDVIEW_ERA);
        }

        if (newWorldview === CUSTOM_WORLDVIEW_VALUE) {
            // Keep custom text field open
        } else if (newWorldview === "NONE") {
            setCustomWorldviewText(''); 
        } else {
            setCustomWorldviewText(''); 
        }
    }, [selectedWorldviewEra]);

    const handleManualAgeGroupChange = useCallback((ageGroupValue: string) => {
        setManualSelectedAgeGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ageGroupValue)) {
                newSet.delete(ageGroupValue);
            } else {
                newSet.add(ageGroupValue);
            }
            return newSet;
        });
    }, []);

    const getAgeRangeParam = useCallback((): string | string[] => {
        if (isManualAgeRange && manualSelectedAgeGroups.size > 0) {
            return Array.from(manualSelectedAgeGroups);
        }
        return GENDER_RATIO_AUTO_ID;
    }, [isManualAgeRange, manualSelectedAgeGroups]);

    const getGenderRatioParam = useCallback((): string => {
        return isManualGenderRatio ? manualMalePercentage.toString() : GENDER_RATIO_AUTO_ID;
    }, [isManualGenderRatio, manualMalePercentage]);

    const validateForm = useCallback(() => {
        const newErrors: GalleryFormValidationErrors = {};
        if (!topic.trim()) {
            newErrors.topic = '주제를 입력해주세요.';
        } else if (topic.length > 20) {
            newErrors.topic = '갤러리 주제는 20자 이내로 입력해주세요.';
        }

        if (selectedWorldview === CUSTOM_WORLDVIEW_VALUE) {
            if (!customWorldviewText.trim()) {
                newErrors.customWorldviewText = '직접 입력 세계관 설명을 입력해주세요.';
            } else if (customWorldviewText.length > MAX_CUSTOM_WORLDVIEW_LENGTH) {
                newErrors.customWorldviewText = `세계관 설명은 ${MAX_CUSTOM_WORLDVIEW_LENGTH}자 이내로 입력해주세요.`;
            }
        }

        if (discussionContext.length > 50) {
            newErrors.discussionContext = '현재 논의중인 내용은 50자 이내로 입력해주세요.';
        }
        if (userSpecies.length > MAX_USER_SPECIES_LENGTH) {
            newErrors.userSpecies = `사용자 종족은 ${MAX_USER_SPECIES_LENGTH}자 이내로 입력해주세요.`;
        }
        if (userAffiliation.length > MAX_USER_AFFILIATION_LENGTH) {
            newErrors.userAffiliation = `사용자 소속은 ${MAX_USER_AFFILIATION_LENGTH}자 이내로 입력해주세요.`;
        }
        
        if (userNicknameType === 'FIXED') {
            if (!fixedNickname.trim()) {
                newErrors.fixedNickname = '고정 닉네임을 입력해주세요.';
            } else if (fixedNickname.length > 10) {
                newErrors.fixedNickname = '닉네임은 10자 이내로 입력해주세요.';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [topic, discussionContext, userSpecies, userAffiliation, selectedWorldview, customWorldviewText, userNicknameType, fixedNickname]);

    const specificAgeGroupOptions = useMemo(() => AGE_RANGE_OPTIONS.filter(opt => opt.value !== DEFAULT_AGE_RANGE), []);

    // Helper: Apply Preset
    const applyPreset = useCallback((settings: GalleryFormSettings) => {
        setTopic(settings.topic);
        setDiscussionContext(settings.discussionContext);
        setSelectedWorldview(settings.selectedWorldview);
        setCustomWorldviewText(settings.customWorldviewText);
        // If preset has no era (old preset format), default to CONTEMPORARY
        setSelectedWorldviewEra(settings.selectedWorldviewEra || DEFAULT_WORLDVIEW_ERA);
        setSelectedToxicityLevel(settings.selectedToxicityLevel);
        setSelectedAnonymousNickRatio(settings.selectedAnonymousNickRatio);
        setUserSpecies(settings.userSpecies);
        setUserAffiliation(settings.userAffiliation);
        setIsManualGenderRatio(settings.isManualGenderRatio);
        setManualMalePercentage(settings.manualMalePercentage);
        setIsManualAgeRange(settings.isManualAgeRange);
        setManualSelectedAgeGroups(new Set(settings.manualSelectedAgeGroups));
        setIsQualityUpgradeUnlocked(settings.isQualityUpgradeUnlocked);
        setIsQualityUpgradeEnabled(settings.isQualityUpgradeEnabled);
        setIsSearchEnabled(settings.isSearchEnabled);
        setSelectedModel(settings.selectedModel);
        setUserNicknameType(settings.userNicknameType);
        setFixedNickname(settings.fixedNickname);
        setUserReputation(settings.userReputation);
    }, []);

    // Helper: Get Current Settings for Save
    const getCurrentSettings = useCallback((): GalleryFormSettings => {
        return {
            topic,
            discussionContext,
            selectedWorldview,
            customWorldviewText,
            selectedWorldviewEra,
            selectedToxicityLevel,
            selectedAnonymousNickRatio,
            userSpecies,
            userAffiliation,
            isManualGenderRatio,
            manualMalePercentage,
            isManualAgeRange,
            manualSelectedAgeGroups: Array.from(manualSelectedAgeGroups),
            isQualityUpgradeUnlocked,
            isQualityUpgradeEnabled,
            isSearchEnabled,
            selectedModel,
            userNicknameType,
            fixedNickname,
            userReputation
        };
    }, [
        topic, discussionContext, selectedWorldview, customWorldviewText, selectedWorldviewEra,
        selectedToxicityLevel, selectedAnonymousNickRatio, userSpecies, userAffiliation,
        isManualGenderRatio, manualMalePercentage, isManualAgeRange, manualSelectedAgeGroups,
        isQualityUpgradeUnlocked, isQualityUpgradeEnabled, isSearchEnabled, selectedModel,
        userNicknameType, fixedNickname, userReputation
    ]);

    return {
        topic, setTopic,
        discussionContext, setDiscussionContext,
        selectedWorldview, setSelectedWorldview,
        customWorldviewText, setCustomWorldviewText, 
        selectedWorldviewEra, setSelectedWorldviewEra,
        selectedToxicityLevel, setSelectedToxicityLevel,
        selectedAnonymousNickRatio, setSelectedAnonymousNickRatio,
        userSpecies, setUserSpecies,
        userAffiliation, setUserAffiliation,
        isManualGenderRatio, setIsManualGenderRatio,
        manualMalePercentage, setManualMalePercentage,
        isManualAgeRange, setIsManualAgeRange,
        manualSelectedAgeGroups, setManualSelectedAgeGroups,
        isQualityUpgradeUnlocked, setIsQualityUpgradeUnlocked,
        isQualityUpgradeEnabled, setIsQualityUpgradeEnabled,
        isSearchEnabled, setIsSearchEnabled,
        selectedModel, setSelectedModel,
        userNicknameType, setUserNicknameType,
        fixedNickname, setFixedNickname,
        userReputation, setUserReputation,
        generatedIp,
        handleWorldviewChange,
        handleManualAgeGroupChange,
        getAgeRangeParam,
        getGenderRatioParam,
        validateForm,
        applyPreset,
        getCurrentSettings,
        errors,
        specificAgeGroupOptions,
        WORLDVIEW_OPTIONS,
        WORLDVIEW_ERA_OPTIONS,
        TOXICITY_LEVEL_OPTIONS,
        ANONYMOUS_NICK_RATIO_OPTIONS,
        MAX_USER_SPECIES_LENGTH,
        MAX_USER_AFFILIATION_LENGTH,
        MAX_CUSTOM_WORLDVIEW_LENGTH, 
        AGE_RANGE_OPTIONS,
    };
};
