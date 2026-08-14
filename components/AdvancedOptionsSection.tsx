import React from 'react';
import { AI_MODELS, SEARCH_GROUNDING_RELEASE_ENABLED } from '../constants';
import { AiProvider } from '../types';
import { useGalleryFormContext } from '../context/GalleryFormContext';
import { AiConnectionSettings } from './AiConnectionSettings';
import type { AiCredentialStatus } from '../services/aiCredentialClient';

interface AdvancedOptionsSectionProps {
  selectedModel: string;
  onSelectedModelChange: (model: string) => void;
  isSearchEnabled: boolean;
  onSearchEnabledChange: (checked: boolean) => void;
  credentialStatus: AiCredentialStatus | null;
  isCheckingCredentials: boolean;
  onCredentialStatusChange: (status: AiCredentialStatus) => void;
}

export const AdvancedOptionsSection: React.FC<AdvancedOptionsSectionProps> = ({
  selectedModel,
  onSelectedModelChange,
  isSearchEnabled,
  onSearchEnabledChange,
  credentialStatus,
  isCheckingCredentials,
  onCredentialStatusChange,
}) => {
  const { selectedProvider, setSelectedProvider } = useGalleryFormContext();
  const modelOptions = AI_MODELS[selectedProvider];
  const selectedModelDefinition = modelOptions.find(model => model.value === selectedModel);
  const modelSupportsSearch = selectedModelDefinition?.supportsSearch ?? false;
  const searchAvailable = SEARCH_GROUNDING_RELEASE_ENABLED && modelSupportsSearch;
  const inputClass =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-500 outline-none appearance-none cursor-pointer';
  const labelClass = 'block text-sm font-bold text-slate-700 mb-2';

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="providerSelect" className={labelClass}>
          AI 공급자 선택
        </label>
        <div className="relative">
          <select
            id="providerSelect"
            value={selectedProvider}
            onChange={event => setSelectedProvider(event.target.value as AiProvider)}
            className={inputClass}
          >
            <option value="gemini">Gemini Developer API</option>
            <option value="vertex">Google Cloud Vertex AI</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
            <i className="fas fa-chevron-down text-xs"></i>
          </div>
        </div>
        <p className="ml-1 mt-2 text-xs text-slate-600">
          공급자·모델·검색·연결 설정은 프리셋을 불러와도 현재 값을 유지합니다.
        </p>
      </div>

      <div>
        <label htmlFor="modelSelect" className={labelClass}>
          AI 모델 선택
        </label>
        <div className="relative">
          <select
            id="modelSelect"
            value={selectedModel}
            onChange={e => onSelectedModelChange(e.target.value)}
            className={inputClass}
          >
            {modelOptions.map(model => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
            <i className="fas fa-chevron-down text-xs"></i>
          </div>
        </div>
        <p className="ml-1 mt-2 text-xs text-slate-600">
          * 'Pro' 모델은 더 창의적이지만 생성 속도가 느릴 수 있습니다.
        </p>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <label
          htmlFor="searchEnabledCheckbox"
          className={`flex items-start ${searchAvailable ? 'cursor-pointer group' : 'cursor-not-allowed'}`}
        >
          <div className="flex items-center h-5 mt-0.5">
            <input
              type="checkbox"
              id="searchEnabledCheckbox"
              checked={isSearchEnabled && searchAvailable}
              onChange={e => onSearchEnabledChange(e.target.checked)}
              disabled={!searchAvailable}
              aria-labelledby="search-grounding-label"
              aria-describedby="search-grounding-availability"
              className="h-5 w-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="ml-3">
            <span
              id="search-grounding-label"
              className="block text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors"
            >
              실시간 웹 검색 반영
            </span>
            <p id="search-grounding-availability" className="mt-1 text-xs text-slate-600">
              {!SEARCH_GROUNDING_RELEASE_ENABLED
                ? '공식 표시·저장 조건을 충족하는 전용 흐름을 준비 중입니다.'
                : modelSupportsSearch
                  ? 'Google 검색 결과를 반영하여 최신 뉴스나 트렌드를 갤러리 내용에 포함시킵니다. (지구/현대 세계관 추천)'
                  : '선택한 모델은 Google Search grounding을 지원하지 않습니다.'}
            </p>
          </div>
        </label>
      </div>

      <AiConnectionSettings
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        initialStatus={credentialStatus}
        isInitialStatusLoading={isCheckingCredentials}
        onStatusChange={onCredentialStatusChange}
      />
    </div>
  );
};
