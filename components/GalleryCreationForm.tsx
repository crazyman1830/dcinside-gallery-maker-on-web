import React, { useCallback, useEffect, useState } from 'react';
import { useGalleryForm, GalleryFormValidationErrors } from '../hooks/useGalleryForm';
import { GalleryFormProvider } from '../context/GalleryFormContext';
import { LoadingSpinner } from './LoadingSpinner';
import { FormSection } from './FormSection';
import { WorldviewSection } from './WorldviewSection';
import { UserConfigSection } from './UserConfigSection';
import { GenerationOptionsSection } from './GenerationOptionsSection';
import { AdvancedOptionsSection } from './AdvancedOptionsSection';
import { UserProfileSection } from './UserProfileSection';
import { PresetSection } from './PresetSection';
import {
  deleteUserPreset,
  getPresets,
  getPresetStorageWarning,
  saveUserPreset,
} from '../services/presetService';
import { AiCredentialStatus, getAiCredentialStatus } from '../services/aiCredentialClient';
import { CreateGalleryParams, Preset, UserProfile } from '../types';
import {
  DEFAULT_AI_PROVIDER,
  DEFAULT_MODEL_BY_PROVIDER,
  SEARCH_GROUNDING_RELEASE_ENABLED,
} from '../constants';

interface GalleryCreationFormProps {
  isLoading: boolean;
  onSubmit: (params: CreateGalleryParams & { userProfile: UserProfile }) => Promise<void> | void;
  setFormError: (message: string | null) => void;
}

// Inner Component containing the UI logic
const GalleryCreationFormContent: React.FC<GalleryCreationFormProps> = ({
  isLoading,
  onSubmit,
  setFormError,
}) => {
  const form = useGalleryForm();

  // Preset State
  const [presets, setPresets] = useState<Preset[]>([]);
  const [credentialStatus, setCredentialStatus] = useState<AiCredentialStatus | null>(null);
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(true);
  const [presetWarning, setPresetWarning] = useState<string | null>(null);

  useEffect(() => {
    setPresets(getPresets());
    let isMounted = true;
    void getAiCredentialStatus()
      .then(status => {
        if (isMounted) setCredentialStatus(status);
      })
      .catch(() => {
        // Generation can still surface a precise server-side error when
        // status lookup itself is unavailable.
      })
      .finally(() => {
        if (isMounted) setIsCheckingCredentials(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSavePreset = (name: string) => {
    const currentSettings = form.getCurrentSettings();
    const updatedPresets = saveUserPreset(name, currentSettings);
    setPresets(updatedPresets);
    setPresetWarning(getPresetStorageWarning());
  };

  const handleLoadPreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset) {
      form.applyPreset(preset.settings);
      setFormError(null);
    }
  };

  const handleDeletePreset = (id: string) => {
    const updatedPresets = deleteUserPreset(id);
    setPresets(updatedPresets);
  };

  const handleCredentialStatusChange = useCallback(
    (status: AiCredentialStatus) => {
      setCredentialStatus(status);
      setFormError(null);
    },
    [setFormError],
  );

  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    presets: false,
    profile: false,
    worldview: true,
    user: false,
    options: true,
    advanced: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section],
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

    const validationErrors = form.validateForm();
    const firstErrorKey = Object.keys(validationErrors)[0] as
      keyof GalleryFormValidationErrors | undefined;
    if (firstErrorKey) {
      // Field-level alerts already describe validation failures next to the
      // relevant control. Clear any older global error so it is not repeated
      // above the form or left stale after the user corrects the input.
      setFormError(null);

      const section =
        firstErrorKey === 'fixedNickname'
          ? 'profile'
          : firstErrorKey === 'customWorldviewText'
            ? 'worldview'
            : firstErrorKey === 'topic' || firstErrorKey === 'discussionContext'
              ? 'options'
              : 'user';
      setOpenSections(previous => ({ ...previous, [section]: true }));

      const fieldId: Record<keyof GalleryFormValidationErrors, string> = {
        topic: 'topic',
        discussionContext: 'discussionContext',
        customWorldviewText: 'customWorldviewText',
        userSpecies: 'userSpecies',
        userAffiliation: 'userAffiliation',
        fixedNickname: 'fixedNickname',
        manualSelectedAgeGroups: 'manual-age-groups',
      };
      requestAnimationFrame(() => {
        const field = document.getElementById(fieldId[firstErrorKey]);
        field?.focus();
        field?.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
      return;
    }

    if (isCheckingCredentials) {
      setOpenSections(previous => ({ ...previous, advanced: true }));
      setFormError('AI 연결 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.');
      requestAnimationFrame(() => {
        const connectionSettings = document.getElementById('ai-connection-settings');
        connectionSettings?.focus();
        connectionSettings?.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
      return;
    }

    if (credentialStatus && !credentialStatus.providers[form.selectedProvider].configured) {
      setOpenSections(previous => ({ ...previous, advanced: true }));
      setFormError(
        `${form.selectedProvider === 'gemini' ? 'Gemini' : 'Vertex AI'} 연결 설정을 먼저 완료해주세요.`,
      );
      requestAnimationFrame(() => {
        const connectionSettings = document.getElementById('ai-connection-settings');
        connectionSettings?.focus();
        connectionSettings?.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
      return;
    }

    setFormError(null);

    onSubmit({
      topic: form.topic,
      discussionContext: form.discussionContext,
      worldviewValue: form.selectedWorldview,
      customWorldviewText:
        form.selectedWorldview === 'CUSTOM' ? form.customWorldviewText : undefined,
      worldviewEraValue: form.selectedWorldviewEra,
      toxicityLevelValue: form.selectedToxicityLevel,
      anonymousNickRatioValue: form.selectedAnonymousNickRatio,
      userSpecies: form.userSpecies,
      userAffiliation: form.userAffiliation,
      genderRatioValue: form.getGenderRatioParam(),
      ageRangeValue: form.getAgeRangeParam(),
      selectedProvider: form.selectedProvider,
      selectedModel: form.selectedModel,
      useSearch: SEARCH_GROUNDING_RELEASE_ENABLED && form.isSearchEnabled,
      userProfile: {
        nicknameType: form.userNicknameType,
        nickname: form.userNicknameType === 'FIXED' ? form.fixedNickname : 'ㅇㅇ',
        ip: form.userNicknameType === 'ANONYMOUS' ? form.generatedIp : undefined,
        reputation: form.userReputation,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="space-y-4">
        <FormSection
          title="주제와 현재 떡밥"
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
          title="빠른 시작 (프리셋)"
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
        {presetWarning && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {presetWarning}
          </p>
        )}

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
          title="고급 설정"
          iconClass="fas fa-rocket"
          iconColorClass="text-orange-500"
          isOpen={openSections.advanced}
          onToggle={() => toggleSection('advanced')}
          id="advanced"
        >
          <AdvancedOptionsSection
            selectedModel={form.selectedModel}
            onSelectedModelChange={form.setSelectedModel}
            isSearchEnabled={form.isSearchEnabled}
            onSearchEnabledChange={form.setIsSearchEnabled}
            credentialStatus={credentialStatus}
            isCheckingCredentials={isCheckingCredentials}
            onCredentialStatusChange={handleCredentialStatusChange}
          />
        </FormSection>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 flex items-center justify-center text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-live="polite"
      >
        {isLoading ? (
          <LoadingSpinner small={true} />
        ) : (
          <>
            <i className="fas fa-magic mr-2" aria-hidden="true"></i>갤러리 생성
          </>
        )}
      </button>
    </form>
  );
};

// Wrapper Component to provide Context
export const GalleryCreationForm: React.FC<GalleryCreationFormProps> = props => {
  return (
    <GalleryFormProvider
      initialState={{
        selectedProvider: DEFAULT_AI_PROVIDER,
        selectedModel: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_AI_PROVIDER],
      }}
    >
      <GalleryCreationFormContent {...props} />
    </GalleryFormProvider>
  );
};
