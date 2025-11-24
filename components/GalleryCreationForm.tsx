
import React, { useState, useEffect } from 'react';
import { useGalleryForm, GalleryFormValidationErrors } from '../hooks/useGalleryForm';
import { LoadingSpinner } from './LoadingSpinner';
import { FormSection } from './FormSection';
import { WorldviewSection } from './WorldviewSection';
import { UserConfigSection } from './UserConfigSection';
import { GenerationOptionsSection } from './GenerationOptionsSection';
import { AdvancedOptionsSection } from './AdvancedOptionsSection';
import { UserProfileSection } from './UserProfileSection';
import { PresetSection } from './PresetSection';
import { getPresets, saveUserPreset, deleteUserPreset } from '../services/presetService';
import { Preset } from '../types';

interface GalleryCreationFormProps {
    isLoading: boolean;
    isApiKeyAvailable: boolean;
    onSubmit: (params: any) => void;
    setFormError: (message: string) => void;
}

export const GalleryCreationForm: React.FC<GalleryCreationFormProps> = ({ isLoading, isApiKeyAvailable, onSubmit, setFormError }) => {
    const form = useGalleryForm({ isQualityUpgradeUnlocked: true });
    
    // Preset State
    const [presets, setPresets] = useState<Preset[]>([]);

    useEffect(() => {
        setPresets(getPresets());
    }, []);

    const handleSavePreset = (name: string) => {
        const currentSettings = form.getCurrentSettings();
        const updatedPresets = saveUserPreset(name, currentSettings);
        setPresets(updatedPresets);
    };

    const handleLoadPreset = (id: string) => {
        const preset = presets.find(p => p.id === id);
        if (preset) {
            form.applyPreset(preset.settings);
        }
    };

    const handleDeletePreset = (id: string) => {
        const updatedPresets = deleteUserPreset(id);
        setPresets(updatedPresets);
    };

    const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
        presets: true,
        profile: true,
        worldview: true,
        user: false,
        options: false,
        advanced: false,
    });

    const toggleSection = (section: string) => {
        setOpenSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const handleExpandAll = () => {
        setOpenSections({
            presets: true,
            profile: true,
            worldview: true,
            user: true,
            options: true,
            advanced: true,
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!isApiKeyAvailable) {
            setFormError("API_KEY가 설정되지 않았습니다. 갤러리 생성 기능이 작동하지 않습니다. 환경 변수를 설정해주세요.");
            return;
        }

        if (!form.validateForm()) {
            const firstErrorKey = Object.keys(form.errors)[0] as keyof GalleryFormValidationErrors;
            const errorMessage = form.errors[firstErrorKey] || "양식에 오류가 있습니다. 입력값을 확인해주세요.";
            setFormError(errorMessage);
            
            // Auto-open section with error
            if (firstErrorKey === 'fixedNickname') toggleSection('profile');
            else if (firstErrorKey === 'customWorldviewText') toggleSection('worldview');
            else if (firstErrorKey === 'topic' || firstErrorKey === 'discussionContext') toggleSection('options');
            
            return;
        }
        
        setFormError('');

        const isCustomOrFantasy = form.selectedWorldview === 'CUSTOM' || form.selectedWorldview === 'MURIM' || form.selectedWorldview === 'FANTASY';

        onSubmit({
            topic: form.topic,
            discussionContext: form.discussionContext,
            worldviewValue: form.selectedWorldview,
            customWorldviewText: form.selectedWorldview === 'CUSTOM' ? form.customWorldviewText : undefined,
            worldviewEraValue: isCustomOrFantasy ? '' : form.selectedWorldviewEra,
            toxicityLevelValue: form.selectedToxicityLevel,
            anonymousNickRatioValue: form.selectedAnonymousNickRatio,
            userSpecies: form.userSpecies,
            userAffiliation: form.userAffiliation,
            genderRatioValue: form.getGenderRatioParam(),
            ageRangeValue: form.getAgeRangeParam(),
            selectedModel: form.selectedModel,
            useSearch: form.isSearchEnabled,
            // Pass User Profile
            userProfile: {
                nicknameType: form.userNicknameType,
                nickname: form.userNicknameType === 'FIXED' ? form.fixedNickname : 'ㅇㅇ',
                ip: form.userNicknameType === 'ANONYMOUS' ? form.generatedIp : undefined,
                reputation: form.userReputation
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="space-y-4">
            <FormSection
                title="프리셋 (불러오기/저장)"
                iconClass="fas fa-bookmark"
                iconColorClass="text-yellow-500"
                isOpen={openSections.presets}
                onToggle={() => toggleSection('presets')}
                id="presets"
            >
                <PresetSection
                    presets={presets}
                    onSavePreset={handleSavePreset}
                    onLoadPreset={handleLoadPreset}
                    onDeletePreset={handleDeletePreset}
                    onExpandAllRequested={handleExpandAll}
                />
            </FormSection>

            <FormSection
                title="내 프로필 설정"
                iconClass="fas fa-id-card"
                iconColorClass="text-indigo-500"
                isOpen={openSections.profile}
                onToggle={() => toggleSection('profile')}
                id="profile"
            >
                <UserProfileSection
                    nicknameType={form.userNicknameType}
                    onNicknameTypeChange={form.setUserNicknameType}
                    fixedNickname={form.fixedNickname}
                    onFixedNicknameChange={form.setFixedNickname}
                    userReputation={form.userReputation}
                    onUserReputationChange={form.setUserReputation}
                    generatedIp={form.generatedIp}
                    errors={form.errors}
                />
            </FormSection>

            <FormSection
                title="세계관 및 시간대 설정"
                iconClass="fas fa-globe-americas"
                iconColorClass="text-blue-500"
                isOpen={openSections.worldview}
                onToggle={() => toggleSection('worldview')}
                id="worldview"
            >
                <WorldviewSection
                    selectedWorldview={form.selectedWorldview}
                    onWorldviewChange={form.handleWorldviewChange}
                    worldviewOptions={form.WORLDVIEW_OPTIONS}
                    customWorldviewText={form.customWorldviewText}
                    onCustomWorldviewTextChange={form.setCustomWorldviewText}
                    maxCustomWorldviewLength={form.MAX_CUSTOM_WORLDVIEW_LENGTH}
                    selectedWorldviewEra={form.selectedWorldviewEra}
                    onWorldviewEraChange={form.setSelectedWorldviewEra}
                    worldviewEraOptions={form.WORLDVIEW_ERA_OPTIONS}
                    errors={form.errors}
                />
            </FormSection>

            <FormSection
                title="갤러리 사용자 설정"
                iconClass="fas fa-users-cog"
                iconColorClass="text-green-500"
                isOpen={openSections.user}
                onToggle={() => toggleSection('user')}
                id="user"
            >
                <UserConfigSection
                    userSpecies={form.userSpecies}
                    onUserSpeciesChange={form.setUserSpecies}
                    maxUserSpeciesLength={form.MAX_USER_SPECIES_LENGTH}
                    userAffiliation={form.userAffiliation}
                    onUserAffiliationChange={form.setUserAffiliation}
                    maxUserAffiliationLength={form.MAX_USER_AFFILIATION_LENGTH}
                    isManualGenderRatio={form.isManualGenderRatio}
                    onIsManualGenderRatioChange={form.setIsManualGenderRatio}
                    manualMalePercentage={form.manualMalePercentage}
                    onManualMalePercentageChange={form.setManualMalePercentage}
                    isManualAgeRange={form.isManualAgeRange}
                    onIsManualAgeRangeChange={form.setIsManualAgeRange}
                    manualSelectedAgeGroups={form.manualSelectedAgeGroups}
                    onManualAgeGroupChange={form.handleManualAgeGroupChange}
                    specificAgeGroupOptions={form.specificAgeGroupOptions}
                    errors={form.errors}
                />
            </FormSection>
            
            <FormSection
                title="갤러리 생성 옵션"
                iconClass="fas fa-cogs"
                iconColorClass="text-purple-500"
                isOpen={openSections.options}
                onToggle={() => toggleSection('options')}
                id="options"
            >
                <GenerationOptionsSection
                    selectedToxicityLevel={form.selectedToxicityLevel}
                    onToxicityLevelChange={form.setSelectedToxicityLevel}
                    toxicityLevelOptions={form.TOXICITY_LEVEL_OPTIONS}
                    selectedAnonymousNickRatio={form.selectedAnonymousNickRatio}
                    onAnonymousNickRatioChange={form.setSelectedAnonymousNickRatio}
                    anonymousNickRatioOptions={form.ANONYMOUS_NICK_RATIO_OPTIONS}
                    topic={form.topic}
                    onTopicChange={form.setTopic}
                    discussionContext={form.discussionContext}
                    onDiscussionContextChange={form.setDiscussionContext}
                    errors={form.errors}
                />
            </FormSection>

            <FormSection
                title="고급 설정"
                iconClass="fas fa-rocket"
                iconColorClass="text-orange-500"
                isOpen={openSections.advanced}
                onToggle={() => toggleSection('advanced')}
                id="advanced"
            >
                <AdvancedOptionsSection
                    isQualityUpgradeUnlocked={form.isQualityUpgradeUnlocked}
                    selectedModel={form.selectedModel}
                    onSelectedModelChange={form.setSelectedModel}
                    isSearchEnabled={form.isSearchEnabled}
                    onSearchEnabledChange={form.setIsSearchEnabled}
                />
            </FormSection>
          </div>
          
          <button type="submit" disabled={isLoading || !isApiKeyAvailable} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 flex items-center justify-center text-lg" aria-live="polite">
            {isLoading ? <LoadingSpinner small={true} /> : <><i className="fas fa-magic mr-2"></i>갤러리 생성</>}
          </button>
        </form>
    );
};
