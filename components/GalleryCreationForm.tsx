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
import { FixedNicknameSettings } from './FixedNicknameSettings';
import { PresetSection } from './PresetSection';
import {
  deleteUserPreset,
  getPresets,
  getPresetStorageWarning,
  saveUserPreset,
} from '../services/presetService';
import { AiCredentialStatus, getAiCredentialStatus } from '../services/aiCredentialClient';
import { CreateGalleryInput, Preset, UserProfile } from '../types';
import {
  DEFAULT_AI_PROVIDER,
  DEFAULT_MODEL_BY_PROVIDER,
  SEARCH_GROUNDING_RELEASE_ENABLED,
} from '../constants';
import { Icon } from './Icon';

interface GalleryCreationFormProps {
  isLoading: boolean;
  onSubmit: (params: CreateGalleryInput & { userProfile: UserProfile }) => Promise<void> | void;
  setFormError: (message: string | null) => void;
}

// Inner Component containing the UI logic
export const GalleryCreationFormContent: React.FC<GalleryCreationFormProps> = ({
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
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

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
      setPresetNotice(`'${preset.name.replace('[예시] ', '')}' 설정을 불러왔습니다.`);
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

  const providerLabel = form.selectedProvider === 'gemini' ? 'Gemini' : 'Vertex AI';
  const needsConnection =
    !isCheckingCredentials &&
    !!credentialStatus &&
    !credentialStatus.providers[form.selectedProvider].configured;

  const openConnectionSettings = () => {
    setOpenSections(previous => ({ ...previous, advanced: true }));
    requestAnimationFrame(() => {
      const connectionSettings = document.getElementById('ai-connection-settings');
      connectionSettings?.focus({ preventScroll: true });
      connectionSettings?.scrollIntoView({ behavior: 'auto', block: 'center' });
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
            : firstErrorKey === 'topic' ||
                firstErrorKey === 'discussionContext' ||
                firstErrorKey === 'fixedNicknames'
              ? 'options'
              : 'user';
      setOpenSections(previous => ({ ...previous, [section]: true }));

      const fieldId: Record<keyof GalleryFormValidationErrors, string> = {
        fixedNicknames: 'fixed-nicknames-settings',
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
      setFormError('AI 연결 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.');
      openConnectionSettings();
      return;
    }

    if (needsConnection) {
      setFormError(`${providerLabel} 연결 설정을 먼저 완료해주세요.`);
      openConnectionSettings();
      return;
    }

    setFormError(null);

    onSubmit({
      fixedNicknames: form.fixedNicknames,
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

  const connectionLabel = isCheckingCredentials
    ? '연결 확인 중'
    : credentialStatus?.providers[form.selectedProvider].configured
      ? '연결 설정됨'
      : credentialStatus
        ? '연결 설정 필요'
        : '연결 상태 확인 불가';

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      {needsConnection && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">
              <Icon icon="fas fa-plug" className="mr-2" />
              {providerLabel} 연결이 필요합니다
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              갤러리를 생성하려면 먼저 API 키나 서비스 계정을 서버에 등록해주세요. 자격증명은
              브라우저에 저장되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={openConnectionSettings}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            연결 설정 열기
          </button>
        </div>
      )}

      {/* A disabled fieldset locks every control while a generation is running so
          the visible settings always match the request that is in flight. */}
      <fieldset
        disabled={isLoading}
        className="min-w-0 transition-opacity disabled:opacity-60"
        aria-describedby={isLoading ? 'form-locked-help' : undefined}
      >
        {isLoading && (
          <p id="form-locked-help" className="sr-only">
            생성이 끝날 때까지 설정을 바꿀 수 없습니다.
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="빠른 시작">
          <span className="text-sm font-semibold text-slate-700">빠른 시작</span>
          {presets.slice(0, 3).map(preset => (
            <button
              key={preset.id}
              type="button"
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => handleLoadPreset(preset.id)}
            >
              {preset.name.replace('[예시] ', '')}
            </button>
          ))}
          {presetNotice && (
            <span role="status" className="text-sm text-slate-600">
              {presetNotice}
            </span>
          )}
        </div>

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
              fixedNicknameSlot={
                <div id="fixed-nicknames-settings" tabIndex={-1} className="outline-none">
                  <FixedNicknameSettings
                    value={form.fixedNicknames}
                    onSave={form.setFixedNicknames}
                    disabled={isLoading}
                    reservedNickname={
                      form.userNicknameType === 'FIXED' ? form.fixedNickname : undefined
                    }
                  />
                  {form.errors.fixedNicknames && (
                    <p role="alert" className="mt-2 text-sm text-red-700">
                      {form.errors.fixedNicknames}
                    </p>
                  )}
                </div>
              }
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
            title="프리셋 저장·관리"
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
      </fieldset>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                isCheckingCredentials
                  ? 'animate-pulse bg-slate-300'
                  : credentialStatus?.providers[form.selectedProvider].configured
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
              }`}
              aria-hidden="true"
            />
            <p role="status">
              {providerLabel} · {connectionLabel}
            </p>
            <button
              type="button"
              disabled={isLoading}
              className="rounded-md px-1 py-1 text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              onClick={openConnectionSettings}
            >
              AI 연결 설정으로 이동
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-lg font-bold text-white transition duration-150 ease-in-out hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto sm:min-w-48"
          >
            {isLoading ? (
              <>
                <LoadingSpinner small={true} />
                <span className="ml-2 text-base">생성 중…</span>
              </>
            ) : (
              <>
                <Icon icon="fas fa-magic" className="mr-2" />
                갤러리 생성
              </>
            )}
          </button>
        </div>
      </div>
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
