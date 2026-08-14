import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from 'react';
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
  AGE_RANGE_AUTO_ID,
  AGE_RANGE_OPTIONS,
  DEFAULT_AGE_RANGE,
  MAX_USER_SPECIES_LENGTH,
  MAX_USER_AFFILIATION_LENGTH,
  CUSTOM_WORLDVIEW_VALUE,
  MAX_CUSTOM_WORLDVIEW_LENGTH,
} from '../formOptions';
import { AiProvider, GalleryFormSettings, PresetContentSettings, UserNicknameType } from '../types';
import {
  AI_MODELS,
  DEFAULT_AI_PROVIDER,
  DEFAULT_MODEL_BY_PROVIDER,
  SEARCH_GROUNDING_RELEASE_ENABLED,
} from '../constants';
import { generateRandomIp } from '../utils/common';
import { getPresetContentSettings } from '../services/presetService';

export interface GalleryFormValidationErrors {
  topic?: string;
  discussionContext?: string;
  customWorldviewText?: string;
  userSpecies?: string;
  userAffiliation?: string;
  fixedNickname?: string;
  manualSelectedAgeGroups?: string;
}

interface GalleryFormContextType {
  topic: string;
  setTopic: (v: string) => void;
  discussionContext: string;
  setDiscussionContext: (v: string) => void;
  selectedWorldview: string;
  setSelectedWorldview: (v: string) => void;
  customWorldviewText: string;
  setCustomWorldviewText: (v: string) => void;
  selectedWorldviewEra: string;
  setSelectedWorldviewEra: (v: string) => void;
  selectedToxicityLevel: string;
  setSelectedToxicityLevel: (v: string) => void;
  selectedAnonymousNickRatio: string;
  setSelectedAnonymousNickRatio: (v: string) => void;
  userSpecies: string;
  setUserSpecies: (v: string) => void;
  userAffiliation: string;
  setUserAffiliation: (v: string) => void;
  isManualGenderRatio: boolean;
  setIsManualGenderRatio: (v: boolean) => void;
  manualMalePercentage: number;
  setManualMalePercentage: (v: number) => void;
  isManualAgeRange: boolean;
  setIsManualAgeRange: (v: boolean) => void;
  manualSelectedAgeGroups: Set<string>;
  setManualSelectedAgeGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSearchEnabled: boolean;
  setIsSearchEnabled: (v: boolean) => void;
  selectedProvider: AiProvider;
  setSelectedProvider: (v: AiProvider) => void;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  userNicknameType: UserNicknameType;
  setUserNicknameType: (v: UserNicknameType) => void;
  fixedNickname: string;
  setFixedNickname: (v: string) => void;
  userReputation: number;
  setUserReputation: (v: number) => void;
  generatedIp: string;

  // Actions
  handleWorldviewChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  handleManualAgeGroupChange: (ageGroupValue: string) => void;
  getAgeRangeParam: () => string | string[];
  getGenderRatioParam: () => string;
  validateForm: () => GalleryFormValidationErrors;
  applyPreset: (settings: PresetContentSettings) => void;
  getCurrentSettings: () => GalleryFormSettings;

  // Data & Errors
  errors: GalleryFormValidationErrors;
  specificAgeGroupOptions: { value: string; label: string }[];

  // Constants
  WORLDVIEW_OPTIONS: typeof WORLDVIEW_OPTIONS;
  WORLDVIEW_ERA_OPTIONS: typeof WORLDVIEW_ERA_OPTIONS;
  TOXICITY_LEVEL_OPTIONS: typeof TOXICITY_LEVEL_OPTIONS;
  ANONYMOUS_NICK_RATIO_OPTIONS: typeof ANONYMOUS_NICK_RATIO_OPTIONS;
  MAX_USER_SPECIES_LENGTH: number;
  MAX_USER_AFFILIATION_LENGTH: number;
  MAX_CUSTOM_WORLDVIEW_LENGTH: number;
  AGE_RANGE_OPTIONS: typeof AGE_RANGE_OPTIONS;
}

const GalleryFormContext = createContext<GalleryFormContextType | undefined>(undefined);

interface ProviderProps {
  children: ReactNode;
  initialState?: Partial<GalleryFormSettings>;
}

const getValidProvider = (provider?: AiProvider): AiProvider =>
  provider === 'vertex' ? 'vertex' : DEFAULT_AI_PROVIDER;

const getValidModel = (provider: AiProvider, model?: string): string =>
  model && AI_MODELS[provider].some(option => option.value === model)
    ? model
    : DEFAULT_MODEL_BY_PROVIDER[provider];

export const GalleryFormProvider: React.FC<ProviderProps> = ({ children, initialState }) => {
  const [topic, setTopic] = useState<string>(initialState?.topic || '');
  const [discussionContext, setDiscussionContext] = useState<string>(
    initialState?.discussionContext || '',
  );
  const [selectedWorldview, setSelectedWorldview] = useState<string>(
    initialState?.selectedWorldview || WORLDVIEW_OPTIONS[0].value,
  );
  const [customWorldviewText, setCustomWorldviewText] = useState<string>(
    initialState?.customWorldviewText || '',
  );
  const [selectedWorldviewEra, setSelectedWorldviewEra] = useState<string>(
    initialState?.selectedWorldviewEra || DEFAULT_WORLDVIEW_ERA,
  );
  const [selectedToxicityLevel, setSelectedToxicityLevel] = useState<string>(
    initialState?.selectedToxicityLevel || DEFAULT_TOXICITY_LEVEL,
  );
  const [selectedAnonymousNickRatio, setSelectedAnonymousNickRatio] = useState<string>(
    initialState?.selectedAnonymousNickRatio || DEFAULT_ANONYMOUS_NICK_RATIO,
  );

  const [userSpecies, setUserSpecies] = useState<string>(initialState?.userSpecies || '');
  const [userAffiliation, setUserAffiliation] = useState<string>(
    initialState?.userAffiliation || '',
  );
  const [isManualGenderRatio, setIsManualGenderRatio] = useState<boolean>(
    initialState?.isManualGenderRatio || false,
  );
  const [manualMalePercentage, setManualMalePercentage] = useState<number>(
    initialState?.manualMalePercentage ?? 50,
  );

  const [isManualAgeRange, setIsManualAgeRange] = useState<boolean>(
    initialState?.isManualAgeRange || false,
  );
  const [manualSelectedAgeGroups, setManualSelectedAgeGroups] = useState<Set<string>>(
    initialState?.manualSelectedAgeGroups
      ? new Set(initialState.manualSelectedAgeGroups)
      : new Set(),
  );

  const [isSearchEnabled, setIsSearchEnabled] = useState<boolean>(
    SEARCH_GROUNDING_RELEASE_ENABLED && Boolean(initialState?.isSearchEnabled),
  );
  const initialProvider = getValidProvider(initialState?.selectedProvider);
  const [selectedProvider, setSelectedProviderState] = useState<AiProvider>(initialProvider);
  const [selectedModel, setSelectedModel] = useState<string>(
    getValidModel(initialProvider, initialState?.selectedModel),
  );

  const [userNicknameType, setUserNicknameType] = useState<UserNicknameType>(
    initialState?.userNicknameType || 'ANONYMOUS',
  );
  const [fixedNickname, setFixedNickname] = useState<string>(initialState?.fixedNickname || '');
  const [userReputation, setUserReputation] = useState<number>(
    initialState?.userReputation !== undefined ? initialState.userReputation : 50,
  );
  const [generatedIp, setGeneratedIp] = useState<string>('');

  const [errors, setErrors] = useState<GalleryFormValidationErrors>({});

  useEffect(() => {
    setGeneratedIp(generateRandomIp());
  }, []);

  useEffect(() => {
    setErrors(previous => (previous.topic ? { ...previous, topic: undefined } : previous));
  }, [topic]);

  useEffect(() => {
    setErrors(previous =>
      previous.discussionContext ? { ...previous, discussionContext: undefined } : previous,
    );
  }, [discussionContext]);

  useEffect(() => {
    setErrors(previous =>
      previous.customWorldviewText ? { ...previous, customWorldviewText: undefined } : previous,
    );
  }, [customWorldviewText, selectedWorldview]);

  useEffect(() => {
    setErrors(previous =>
      previous.userSpecies ? { ...previous, userSpecies: undefined } : previous,
    );
  }, [userSpecies]);

  useEffect(() => {
    setErrors(previous =>
      previous.userAffiliation ? { ...previous, userAffiliation: undefined } : previous,
    );
  }, [userAffiliation]);

  useEffect(() => {
    setErrors(previous =>
      previous.fixedNickname ? { ...previous, fixedNickname: undefined } : previous,
    );
  }, [fixedNickname, userNicknameType]);

  useEffect(() => {
    setErrors(previous =>
      previous.manualSelectedAgeGroups
        ? { ...previous, manualSelectedAgeGroups: undefined }
        : previous,
    );
  }, [isManualAgeRange, manualSelectedAgeGroups]);

  const handleWorldviewChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newWorldview = e.target.value;
      setSelectedWorldview(newWorldview);
      if (selectedWorldviewEra === WORLDVIEW_ERA_NOT_APPLICABLE) {
        setSelectedWorldviewEra(DEFAULT_WORLDVIEW_ERA);
      }
      if (newWorldview !== CUSTOM_WORLDVIEW_VALUE) {
        // Reset logic if needed, but keeping custom text is often better UX
      }
    },
    [selectedWorldviewEra],
  );

  const handleManualAgeGroupChange = useCallback((ageGroupValue: string) => {
    setManualSelectedAgeGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ageGroupValue)) newSet.delete(ageGroupValue);
      else newSet.add(ageGroupValue);
      return newSet;
    });
  }, []);

  const getAgeRangeParam = useCallback((): string | string[] => {
    if (isManualAgeRange && manualSelectedAgeGroups.size > 0) {
      return Array.from(manualSelectedAgeGroups);
    }
    return AGE_RANGE_AUTO_ID;
  }, [isManualAgeRange, manualSelectedAgeGroups]);

  const getGenderRatioParam = useCallback((): string => {
    return isManualGenderRatio ? manualMalePercentage.toString() : GENDER_RATIO_AUTO_ID;
  }, [isManualGenderRatio, manualMalePercentage]);

  const setSelectedProvider = useCallback((provider: AiProvider) => {
    setSelectedProviderState(provider);
    setSelectedModel(currentModel => getValidModel(provider, currentModel));
  }, []);

  const validateForm = useCallback(() => {
    const newErrors: GalleryFormValidationErrors = {};
    if (!topic.trim()) newErrors.topic = '주제를 입력해주세요.';
    else if (topic.length > 20) newErrors.topic = '갤러리 주제는 20자 이내로 입력해주세요.';

    if (selectedWorldview === CUSTOM_WORLDVIEW_VALUE) {
      if (!customWorldviewText.trim())
        newErrors.customWorldviewText = '직접 입력 세계관 설명을 입력해주세요.';
      else if (customWorldviewText.length > MAX_CUSTOM_WORLDVIEW_LENGTH)
        newErrors.customWorldviewText = `세계관 설명은 ${MAX_CUSTOM_WORLDVIEW_LENGTH}자 이내로 입력해주세요.`;
    }

    if (discussionContext.length > 500)
      newErrors.discussionContext = '현재 논의중인 내용은 500자 이내로 입력해주세요.';
    if (userSpecies.length > MAX_USER_SPECIES_LENGTH)
      newErrors.userSpecies = `사용자 종족은 ${MAX_USER_SPECIES_LENGTH}자 이내로 입력해주세요.`;
    if (userAffiliation.length > MAX_USER_AFFILIATION_LENGTH)
      newErrors.userAffiliation = `사용자 소속은 ${MAX_USER_AFFILIATION_LENGTH}자 이내로 입력해주세요.`;

    if (userNicknameType === 'FIXED') {
      if (!fixedNickname.trim()) newErrors.fixedNickname = '고정 닉네임을 입력해주세요.';
      else if (fixedNickname.length > 10)
        newErrors.fixedNickname = '닉네임은 10자 이내로 입력해주세요.';
    }

    if (isManualAgeRange && manualSelectedAgeGroups.size === 0) {
      newErrors.manualSelectedAgeGroups = '수동 설정에서는 연령대를 한 개 이상 선택해주세요.';
    }

    setErrors(newErrors);
    return newErrors;
  }, [
    topic,
    discussionContext,
    userSpecies,
    userAffiliation,
    selectedWorldview,
    customWorldviewText,
    userNicknameType,
    fixedNickname,
    isManualAgeRange,
    manualSelectedAgeGroups,
  ]);

  const specificAgeGroupOptions = useMemo(
    () => AGE_RANGE_OPTIONS.filter(opt => opt.value !== DEFAULT_AGE_RANGE),
    [],
  );

  const applyPreset = useCallback((settings: PresetContentSettings) => {
    const content = getPresetContentSettings(settings);
    setTopic(content.topic);
    setDiscussionContext(content.discussionContext);
    setSelectedWorldview(content.selectedWorldview);
    setCustomWorldviewText(content.customWorldviewText);
    setSelectedWorldviewEra(content.selectedWorldviewEra || DEFAULT_WORLDVIEW_ERA);
    setSelectedToxicityLevel(content.selectedToxicityLevel);
    setSelectedAnonymousNickRatio(content.selectedAnonymousNickRatio);
    setUserSpecies(content.userSpecies);
    setUserAffiliation(content.userAffiliation);
    setIsManualGenderRatio(content.isManualGenderRatio);
    setManualMalePercentage(content.manualMalePercentage);
    setIsManualAgeRange(content.isManualAgeRange);
    setManualSelectedAgeGroups(new Set(content.manualSelectedAgeGroups));
    setUserNicknameType(content.userNicknameType);
    setFixedNickname(content.fixedNickname);
    setUserReputation(content.userReputation);
    setErrors({});
  }, []);

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
      isSearchEnabled,
      selectedProvider,
      selectedModel,
      userNicknameType,
      fixedNickname,
      userReputation,
    };
  }, [
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
    manualSelectedAgeGroups,
    isSearchEnabled,
    selectedProvider,
    selectedModel,
    userNicknameType,
    fixedNickname,
    userReputation,
  ]);

  const value = {
    topic,
    setTopic,
    discussionContext,
    setDiscussionContext,
    selectedWorldview,
    setSelectedWorldview,
    customWorldviewText,
    setCustomWorldviewText,
    selectedWorldviewEra,
    setSelectedWorldviewEra,
    selectedToxicityLevel,
    setSelectedToxicityLevel,
    selectedAnonymousNickRatio,
    setSelectedAnonymousNickRatio,
    userSpecies,
    setUserSpecies,
    userAffiliation,
    setUserAffiliation,
    isManualGenderRatio,
    setIsManualGenderRatio,
    manualMalePercentage,
    setManualMalePercentage,
    isManualAgeRange,
    setIsManualAgeRange,
    manualSelectedAgeGroups,
    setManualSelectedAgeGroups,
    isSearchEnabled,
    setIsSearchEnabled,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    userNicknameType,
    setUserNicknameType,
    fixedNickname,
    setFixedNickname,
    userReputation,
    setUserReputation,
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

  return <GalleryFormContext.Provider value={value}>{children}</GalleryFormContext.Provider>;
};

export const useGalleryFormContext = () => {
  const context = useContext(GalleryFormContext);
  if (!context) {
    throw new Error('useGalleryFormContext must be used within a GalleryFormProvider');
  }
  return context;
};
