import React from 'react';
import { InfoTooltip } from './InfoTooltip';
import { GalleryFormValidationErrors } from '../hooks/useGalleryForm';

interface GenerationOptionsSectionProps {
  selectedToxicityLevel: string;
  onToxicityLevelChange: (value: string) => void;
  toxicityLevelOptions: { value: string; label: string }[];

  selectedAnonymousNickRatio: string;
  onAnonymousNickRatioChange: (value: string) => void;
  anonymousNickRatioOptions: { value: string; label: string }[];

  topic: string;
  onTopicChange: (value: string) => void;

  discussionContext: string;
  onDiscussionContextChange: (value: string) => void;

  errors: GalleryFormValidationErrors;
}

export const GenerationOptionsSection: React.FC<GenerationOptionsSectionProps> = ({
  selectedToxicityLevel,
  onToxicityLevelChange,
  toxicityLevelOptions,
  selectedAnonymousNickRatio,
  onAnonymousNickRatioChange,
  anonymousNickRatioOptions,
  topic,
  onTopicChange,
  discussionContext,
  onDiscussionContextChange,
  errors
}) => {
  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-400 outline-none";
  const labelClass = "block text-sm font-bold text-slate-700 mb-2";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
            <label htmlFor="toxicityLevel" className={labelClass}>갤러리 맵기 (수위)</label>
            <div className="relative">
                <select 
                    id="toxicityLevel" 
                    value={selectedToxicityLevel} 
                    onChange={(e) => onToxicityLevelChange(e.target.value)} 
                    className={`${inputClass} appearance-none cursor-pointer`}
                >
                {toxicityLevelOptions.map(tl => (<option key={tl.value} value={tl.value}>{tl.label}</option>))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                    <i className="fas fa-chevron-down text-xs"></i>
                </div>
            </div>
        </div>
        <div>
            <label htmlFor="anonymousNickRatio" className={labelClass}>닉네임 비율</label>
            <div className="relative">
                <select 
                    id="anonymousNickRatio" 
                    value={selectedAnonymousNickRatio} 
                    onChange={(e) => onAnonymousNickRatioChange(e.target.value)} 
                    className={`${inputClass} appearance-none cursor-pointer`}
                >
                {anonymousNickRatioOptions.map(nr => (<option key={nr.value} value={nr.value}>{nr.label}</option>))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                    <i className="fas fa-chevron-down text-xs"></i>
                </div>
            </div>
        </div>
      </div>

      <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
          <div>
            <label htmlFor="topic" className={`${labelClass} text-blue-800`}>갤러리 주제 <span className="text-red-500">*</span></label>
            <input 
                type="text" 
                id="topic" 
                value={topic} 
                onChange={(e) => onTopicChange(e.target.value)} 
                placeholder="예: 고양이, 프로그래밍, 헬스" 
                className={`${inputClass} bg-white border-blue-200 focus:border-blue-500 text-lg font-medium ${errors.topic ? 'border-red-500 bg-red-50' : ''}`} 
                maxLength={20} 
            />
            {errors.topic && <p className="text-xs text-red-500 mt-1.5 font-medium"><i className="fas fa-exclamation-circle mr-1"></i>{errors.topic}</p>}
          </div>

          <div className="mt-6">
            <label htmlFor="discussionContext" className={`${labelClass} text-blue-800`}>
              현재 떡밥 (논의 중인 내용) <span className="font-normal text-slate-400 text-xs ml-1">({discussionContext.length}/50)</span>
              <InfoTooltip text="게시물들의 중심 화제입니다. 구체적인 사건을 입력하면 더 재미있는 결과가 나옵니다." />
            </label>
            <textarea 
                id="discussionContext" 
                value={discussionContext} 
                onChange={(e) => onDiscussionContextChange(e.target.value)} 
                placeholder="예: 이번 업데이트 밸런스 패치 망함, 길고양이 밥주기 찬반 논란 등" 
                className={`${inputClass} bg-white border-blue-200 focus:border-blue-500 resize-y min-h-[80px] ${errors.discussionContext ? 'border-red-500 bg-red-50' : ''}`}
                rows={2} 
                maxLength={50} 
            />
            {errors.discussionContext && <p className="text-xs text-red-500 mt-1.5 font-medium"><i className="fas fa-exclamation-circle mr-1"></i>{errors.discussionContext}</p>}
          </div>
      </div>
    </div>
  );
};