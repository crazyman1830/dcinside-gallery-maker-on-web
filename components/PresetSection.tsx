import React, { useState } from 'react';
import { Preset } from '../types';
import { Icon } from './Icon';

interface PresetSectionProps {
  presets: Preset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  onExpandAllRequested: () => void;
}

export const PresetSection: React.FC<PresetSectionProps> = ({
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onExpandAllRequested,
}) => {
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isBuiltInPreset = selectedPresetId.startsWith('preset-example-');

  const handleLoad = () => {
    if (selectedPresetId) {
      onLoadPreset(selectedPresetId);
      onExpandAllRequested();
    }
  };

  const handleSave = () => {
    if (presetName.trim()) {
      onSavePreset(presetName);
      setPresetName('');
    }
  };

  const presetToDelete = presets.find(p => p.id === selectedPresetId);

  const handleDelete = () => {
    if (!presetToDelete) return;
    onDeletePreset(presetToDelete.id);
    setSelectedPresetId('');
    setIsConfirmingDelete(false);
  };

  const inputClass =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-500 outline-none';
  const buttonClass =
    'px-5 py-3 rounded-xl font-semibold transition-all duration-200 shadow-sm active:scale-95 flex items-center justify-center whitespace-nowrap';

  return (
    <div className="space-y-8">
      <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
        <label
          htmlFor="preset-select"
          className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide"
        >
          저장된 프리셋 불러오기
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <select
              id="preset-select"
              value={selectedPresetId}
              onChange={e => {
                setSelectedPresetId(e.target.value);
                setIsConfirmingDelete(false);
              }}
              className={`${inputClass} appearance-none cursor-pointer`}
            >
              <option value="">-- 프리셋 선택 --</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
              <Icon icon="fas fa-chevron-down" className="text-xs" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleLoad}
            disabled={!selectedPresetId}
            className={`${buttonClass} bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Icon icon="fas fa-upload" className="mr-2" /> 불러오기
          </button>
          {!isBuiltInPreset && (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              disabled={!selectedPresetId}
              className={`${buttonClass} bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label="선택한 프리셋 삭제"
            >
              <Icon icon="fas fa-trash-alt" />
            </button>
          )}
        </div>
        {isConfirmingDelete && presetToDelete && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            <span>&apos;{presetToDelete.name}&apos; 프리셋을 삭제할까요?</span>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              삭제 확인
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              취소
            </button>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3 ml-1">
          <Icon icon="fas fa-shield-alt" className="mr-1" />
          AI 공급자, 모델, 웹 검색 및 연결 설정은 프리셋을 불러와도 변경되지 않습니다.
        </p>
        {presets.length === 0 && (
          <p className="ml-1 mt-3 text-xs text-slate-600">
            <Icon icon="fas fa-info-circle" className="mr-1" />
            저장된 프리셋이 없습니다.
          </p>
        )}
      </div>

      <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
        <label
          htmlFor="preset-name"
          className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide"
        >
          현재 설정 저장하기
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            id="preset-name"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            placeholder="나만의 프리셋 이름 입력"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!presetName.trim()}
            className={`${buttonClass} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Icon icon="fas fa-save" className="mr-2" /> 저장
          </button>
        </div>
      </div>
    </div>
  );
};
