
import React from 'react';
import { InfoTooltip } from './InfoTooltip';
import { GalleryFormValidationErrors } from '../hooks/useGalleryForm';

interface WorldviewSectionProps {
  selectedWorldview: string;
  onWorldviewChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  worldviewOptions: { value: string; label: string }[];
  
  customWorldviewText: string;
  onCustomWorldviewTextChange: (value: string) => void;
  maxCustomWorldviewLength: number;
  
  selectedWorldviewEra: string;
  onWorldviewEraChange: (value: string) => void;
  worldviewEraOptions: { value: string; label: string }[];
  
  errors: GalleryFormValidationErrors;
}

export const WorldviewSection: React.FC<WorldviewSectionProps> = ({
  selectedWorldview,
  onWorldviewChange,
  worldviewOptions,
  customWorldviewText,
  onCustomWorldviewTextChange,
  maxCustomWorldviewLength,
  selectedWorldviewEra,
  onWorldviewEraChange,
  worldviewEraOptions,
  errors
}) => {
  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-400 outline-none";
  const labelClass = "block text-sm font-bold text-slate-700 mb-2";

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="worldview" className={labelClass}>세계관 선택</label>
        <div className="relative">
            <select 
                id="worldview" 
                value={selectedWorldview} 
                onChange={onWorldviewChange} 
                className={`${inputClass} appearance-none cursor-pointer`}
            >
            {worldviewOptions.map(wv => (<option key={wv.value} value={wv.value}>{wv.label}</option>))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                <i className="fas fa-chevron-down text-xs"></i>
            </div>
        </div>
      </div>

      {selectedWorldview === 'CUSTOM' && (
        <div className="animate-fade-in">
          <label htmlFor="customWorldviewText" className={labelClass}>
            세계관 직접 입력 <span className="font-normal text-slate-400 text-xs ml-1">({customWorldviewText.length}/{maxCustomWorldviewLength})</span>
            <InfoTooltip text="AI가 생성할 세계의 핵심 설정입니다. 분위기, 주요 세력, 기술 수준, 독특한 규칙 등을 구체적으로 적어주세요." />
          </label>
          <textarea
            id="customWorldviewText"
            value={customWorldviewText}
            onChange={(e) => onCustomWorldviewTextChange(e.target.value)}
            placeholder="예: 마법과 과학이 공존하는 사이버펑크 도시. 네온사인 아래 마법사들이 해커로 활동한다."
            className={`${inputClass} min-h-[120px] resize-y ${errors.customWorldviewText ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-200' : ''}`}
            maxLength={maxCustomWorldviewLength}
          />
          {errors.customWorldviewText && <p className="text-xs text-red-500 mt-1.5 font-medium"><i className="fas fa-exclamation-circle mr-1"></i>{errors.customWorldviewText}</p>}
        </div>
      )}

      <div>
        <label htmlFor="worldviewEra" className={labelClass}>시간대 설정</label>
        <div className="relative">
            <select
            id="worldviewEra"
            value={selectedWorldviewEra}
            onChange={(e) => onWorldviewEraChange(e.target.value)}
            className={`${inputClass} appearance-none cursor-pointer`}
            >
            {worldviewEraOptions.map(era => (<option key={era.value} value={era.value}>{era.label}</option>))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                <i className="fas fa-chevron-down text-xs"></i>
            </div>
        </div>
        
        <p className="text-xs text-slate-400 mt-2 ml-1">
             <i className="fas fa-info-circle mr-1"></i>
             선택한 세계관과 시간대를 조합하여 독창적인 설정을 만들 수 있습니다. (예: 현대 무협, 중세 사이버펑크 등)
        </p>
      </div>
    </div>
  );
};
