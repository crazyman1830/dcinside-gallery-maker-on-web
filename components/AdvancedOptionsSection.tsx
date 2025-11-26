
import React from 'react';
import { GEMINI_MODEL_TEXT, GEMINI_MODEL_PRO, GEMINI_MODEL_3_PRO } from '../constants';

interface AdvancedOptionsSectionProps {
  isQualityUpgradeUnlocked: boolean;
  selectedModel: string;
  onSelectedModelChange: (model: string) => void;
  isSearchEnabled: boolean;
  onSearchEnabledChange: (checked: boolean) => void;
}

export const AdvancedOptionsSection: React.FC<AdvancedOptionsSectionProps> = ({
  isQualityUpgradeUnlocked,
  selectedModel,
  onSelectedModelChange,
  isSearchEnabled,
  onSearchEnabledChange
}) => {
  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-400 outline-none appearance-none cursor-pointer";
  const labelClass = "block text-sm font-bold text-slate-700 mb-2";

  return (
    <div className="space-y-6">
      {isQualityUpgradeUnlocked && (
        <div>
          <label htmlFor="modelSelect" className={labelClass}>AI 모델 선택</label>
          <div className="relative">
            <select
                id="modelSelect"
                value={selectedModel}
                onChange={(e) => onSelectedModelChange(e.target.value)}
                className={inputClass}
            >
                <option value={GEMINI_MODEL_TEXT}>Gemini 2.5 Flash (빠름, 가벼움)</option>
                <option value={GEMINI_MODEL_PRO}>Gemini 2.5 Pro (안정적)</option>
                <option value={GEMINI_MODEL_3_PRO}>Gemini 3.0 Pro Preview (최신, 강력함, 추천)</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                <i className="fas fa-chevron-down text-xs"></i>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 ml-1">
              * 'Pro' 모델은 더 창의적이지만 생성 속도가 느릴 수 있습니다.
          </p>
        </div>
      )}
      
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <label className="flex items-start cursor-pointer group">
          <div className="flex items-center h-5 mt-0.5">
             <input
                type="checkbox"
                id="searchEnabledCheckbox"
                checked={isSearchEnabled}
                onChange={(e) => onSearchEnabledChange(e.target.checked)}
                className="h-5 w-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 transition-all"
              />
          </div>
          <div className="ml-3">
             <span className="block text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">실시간 웹 검색 반영</span>
             <p className="text-xs text-slate-500 mt-1">
                Google 검색 결과를 반영하여 최신 뉴스나 트렌드를 갤러리 내용에 포함시킵니다. (지구/현대 세계관 추천)
             </p>
          </div>
        </label>
      </div>
    </div>
  );
};
