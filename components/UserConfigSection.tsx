import React from 'react';
import { GalleryFormValidationErrors } from '../hooks/useGalleryForm';

interface UserConfigSectionProps {
  userSpecies: string;
  onUserSpeciesChange: (value: string) => void;
  maxUserSpeciesLength: number;

  userAffiliation: string;
  onUserAffiliationChange: (value: string) => void;
  maxUserAffiliationLength: number;

  isManualGenderRatio: boolean;
  onIsManualGenderRatioChange: (checked: boolean) => void;
  manualMalePercentage: number;
  onManualMalePercentageChange: (value: number) => void;

  isManualAgeRange: boolean;
  onIsManualAgeRangeChange: (checked: boolean) => void;
  manualSelectedAgeGroups: Set<string>;
  onManualAgeGroupChange: (value: string) => void;
  specificAgeGroupOptions: { value: string; label: string }[];

  errors: GalleryFormValidationErrors;
}

export const UserConfigSection: React.FC<UserConfigSectionProps> = ({
  userSpecies,
  onUserSpeciesChange,
  maxUserSpeciesLength,
  userAffiliation,
  onUserAffiliationChange,
  maxUserAffiliationLength,
  isManualGenderRatio,
  onIsManualGenderRatioChange,
  manualMalePercentage,
  onManualMalePercentageChange,
  isManualAgeRange,
  onIsManualAgeRangeChange,
  manualSelectedAgeGroups,
  onManualAgeGroupChange,
  specificAgeGroupOptions,
  errors,
}) => {
  const inputClass =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-500 outline-none';
  const labelClass = 'block text-sm font-bold text-slate-700 mb-2';
  const checkboxClass =
    'h-5 w-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 transition-all cursor-pointer';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="userSpecies" className={labelClass}>
            사용자 종족 <span className="text-xs font-normal text-slate-600">(선택)</span>
          </label>
          <input
            type="text"
            id="userSpecies"
            value={userSpecies}
            onChange={e => onUserSpeciesChange(e.target.value)}
            placeholder="예: 인간, 엘프, AI"
            className={`${inputClass} ${errors.userSpecies ? 'border-red-500 bg-red-50' : ''}`}
            maxLength={maxUserSpeciesLength}
            aria-invalid={!!errors.userSpecies}
            aria-describedby={errors.userSpecies ? 'user-species-error' : undefined}
          />
          {errors.userSpecies && (
            <p id="user-species-error" role="alert" className="text-xs text-red-500 mt-1.5">
              {errors.userSpecies}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="userAffiliation" className={labelClass}>
            사용자 소속 <span className="text-xs font-normal text-slate-600">(선택)</span>
          </label>
          <input
            type="text"
            id="userAffiliation"
            value={userAffiliation}
            onChange={e => onUserAffiliationChange(e.target.value)}
            placeholder="예: 화산파, 반란군"
            className={`${inputClass} ${errors.userAffiliation ? 'border-red-500 bg-red-50' : ''}`}
            maxLength={maxUserAffiliationLength}
            aria-invalid={!!errors.userAffiliation}
            aria-describedby={errors.userAffiliation ? 'user-affiliation-error' : undefined}
          />
          {errors.userAffiliation && (
            <p id="user-affiliation-error" role="alert" className="text-xs text-red-500 mt-1.5">
              {errors.userAffiliation}
            </p>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <span className={labelClass}>사용자 성비</span>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="manualGenderRatioCheckbox"
              checked={isManualGenderRatio}
              onChange={e => onIsManualGenderRatioChange(e.target.checked)}
              className={checkboxClass}
            />
            <label
              htmlFor="manualGenderRatioCheckbox"
              className="text-sm text-slate-600 ml-2 cursor-pointer select-none"
            >
              수동 설정
            </label>
          </div>
        </div>

        {isManualGenderRatio ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 animate-fade-in">
            <input
              type="range"
              id="genderRatioSlider"
              min="0"
              max="100"
              step="1"
              value={manualMalePercentage}
              onChange={e => onManualMalePercentageChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2 text-sm font-medium">
              <span className="text-blue-600">남성 {manualMalePercentage}%</span>
              <span className="text-pink-500">여성 {100 - manualMalePercentage}%</span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 bg-slate-50/50 border border-slate-100 rounded-xl text-sm text-slate-500 flex items-center">
            <i className="fas fa-robot mr-2 text-slate-400"></i> AI가 주제에 맞춰 자동으로 성비를
            결정합니다.
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <span id="manual-age-groups-label" className={labelClass}>
            사용자 연령대
          </span>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="manualAgeRangeCheckbox"
              checked={isManualAgeRange}
              onChange={e => onIsManualAgeRangeChange(e.target.checked)}
              className={checkboxClass}
            />
            <label
              htmlFor="manualAgeRangeCheckbox"
              className="text-sm text-slate-600 ml-2 cursor-pointer select-none"
            >
              수동 설정
            </label>
          </div>
        </div>

        {isManualAgeRange ? (
          <div
            id="manual-age-groups"
            role="group"
            tabIndex={-1}
            aria-labelledby="manual-age-groups-label"
            aria-describedby={
              errors.manualSelectedAgeGroups ? 'manual-age-groups-error' : undefined
            }
            className={`p-4 bg-slate-50 rounded-xl border animate-fade-in outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${errors.manualSelectedAgeGroups ? 'border-red-400' : 'border-slate-200'}`}
          >
            <p className="text-xs text-slate-500 mb-3">참여 가능한 연령대를 모두 선택해주세요.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {specificAgeGroupOptions.map(option => (
                <label
                  key={option.value}
                  className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all duration-200 ${manualSelectedAgeGroups.has(option.value) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-blue-200'}`}
                >
                  <input
                    type="checkbox"
                    value={option.value}
                    checked={manualSelectedAgeGroups.has(option.value)}
                    onChange={() => onManualAgeGroupChange(option.value)}
                    aria-invalid={!!errors.manualSelectedAgeGroups}
                    aria-describedby={
                      errors.manualSelectedAgeGroups ? 'manual-age-groups-error' : undefined
                    }
                    className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 mr-2"
                  />
                  <span
                    className={`text-sm ${manualSelectedAgeGroups.has(option.value) ? 'text-blue-700 font-semibold' : 'text-slate-600'}`}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
            {errors.manualSelectedAgeGroups && (
              <p
                id="manual-age-groups-error"
                role="alert"
                className="mt-3 text-xs font-medium text-red-600"
              >
                {errors.manualSelectedAgeGroups}
              </p>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 bg-slate-50/50 border border-slate-100 rounded-xl text-sm text-slate-500 flex items-center">
            <i className="fas fa-robot mr-2 text-slate-400"></i> AI가 분위기에 맞춰 연령대를 자동
            설정합니다.
          </div>
        )}
      </div>
    </div>
  );
};
