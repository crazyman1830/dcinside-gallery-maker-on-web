import React, { useState } from 'react';
import { Preset } from '../types';

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
  onExpandAllRequested
}) => {
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');

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

  const handleDelete = () => {
    if (selectedPresetId) {
      const presetToDelete = presets.find(p => p.id === selectedPresetId);
      if (presetToDelete && window.confirm(`'${presetToDelete.name}' 프리셋을 정말 삭제하시겠습니까?`)) {
        onDeletePreset(selectedPresetId);
        setSelectedPresetId('');
      }
    }
  };

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-400 outline-none";
  const buttonClass = "px-5 py-3 rounded-xl font-semibold transition-all duration-200 shadow-sm active:scale-95 flex items-center justify-center whitespace-nowrap";

  return (
    <div className="space-y-8">
      <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
        <label htmlFor="preset-select" className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">저장된 프리셋 불러오기</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <select
                id="preset-select"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className={`${inputClass} appearance-none cursor-pointer`}
            >
                <option value="">-- 프리셋 선택 --</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                <i className="fas fa-chevron-down text-xs"></i>
            </div>
          </div>
          
          <button 
            type="button" 
            onClick={handleLoad} 
            disabled={!selectedPresetId} 
            className={`${buttonClass} bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <i className="fas fa-upload mr-2"></i> 불러오기
          </button>
          <button 
            type="button" 
            onClick={handleDelete} 
            disabled={!selectedPresetId} 
            className={`${buttonClass} bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        </div>
        {presets.length === 0 && <p className="text-xs text-slate-400 mt-3 ml-1"><i className="fas fa-info-circle mr-1"></i>저장된 프리셋이 없습니다.</p>}
      </div>

      <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
        <label htmlFor="preset-name" className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">현재 설정 저장하기</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            id="preset-name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="나만의 프리셋 이름 입력"
            className={inputClass}
          />
          <button 
            type="button" 
            onClick={handleSave} 
            disabled={!presetName.trim()} 
            className={`${buttonClass} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <i className="fas fa-save mr-2"></i> 저장
          </button>
        </div>
      </div>
    </div>
  );
};