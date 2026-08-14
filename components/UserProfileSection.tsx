import React from 'react';
import { UserNicknameType } from '../types';
import { GalleryFormValidationErrors } from '../hooks/useGalleryForm';
import { InfoTooltip } from './InfoTooltip';

interface UserProfileSectionProps {
  nicknameType: UserNicknameType;
  onNicknameTypeChange: (type: UserNicknameType) => void;
  fixedNickname: string;
  onFixedNicknameChange: (value: string) => void;
  userReputation: number;
  onUserReputationChange: (value: number) => void;
  generatedIp: string;
  errors: GalleryFormValidationErrors;
}

export const UserProfileSection: React.FC<UserProfileSectionProps> = ({
  nicknameType,
  onNicknameTypeChange,
  fixedNickname,
  onFixedNicknameChange,
  userReputation,
  onUserReputationChange,
  generatedIp,
  errors,
}) => {
  const getReputationLabel = (val: number) => {
    if (val <= 20) return { text: '🤬 비호감 (욕받이)', color: 'text-red-600' };
    if (val <= 40) return { text: '😠 다소 비호감', color: 'text-orange-600' };
    if (val <= 60) return { text: '😐 평범 (눈팅러)', color: 'text-slate-600' };
    if (val <= 80) return { text: '🙂 호감 (유쾌함)', color: 'text-blue-600' };
    return { text: '👑 네임드 (갤주급)', color: 'text-purple-600 font-bold' };
  };

  const reputationInfo = getReputationLabel(userReputation);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="block text-sm font-bold text-slate-700">
          나의 프로필 (닉네임)
          <InfoTooltip text="갤러리 활동 시 사용할 닉네임입니다. '유동닉'은 익명으로 IP 일부가 표시되며, '고정닉'은 나만의 닉네임을 사용합니다." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onNicknameTypeChange('ANONYMOUS')}
            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 flex flex-col gap-2 ${
              nicknameType === 'ANONYMOUS'
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 ring-opacity-50'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span
                className={`font-bold ${nicknameType === 'ANONYMOUS' ? 'text-blue-700' : 'text-slate-600'}`}
              >
                <i className="fas fa-ghost mr-2"></i>유동닉 (익명)
              </span>
              {nicknameType === 'ANONYMOUS' && (
                <i className="fas fa-check-circle text-blue-500"></i>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1">자동으로 생성된 IP로 활동합니다.</div>
          </button>

          <button
            type="button"
            onClick={() => onNicknameTypeChange('FIXED')}
            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 flex flex-col gap-2 ${
              nicknameType === 'FIXED'
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 ring-opacity-50'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span
                className={`font-bold ${nicknameType === 'FIXED' ? 'text-indigo-700' : 'text-slate-600'}`}
              >
                <i className="fas fa-user-tag mr-2"></i>고정닉 (닉네임)
              </span>
              {nicknameType === 'FIXED' && <i className="fas fa-check-circle text-indigo-500"></i>}
            </div>
            <div className="text-xs text-slate-500 mt-1">원하는 닉네임을 설정합니다.</div>
          </button>
        </div>
      </div>

      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 animate-fade-in">
        {nicknameType === 'ANONYMOUS' ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
              <i className="fas fa-user-secret text-xl"></i>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wide mb-1">
                PREVIEW
              </p>
              <p className="text-lg font-bold text-slate-700 flex items-center gap-2">
                ㅇㅇ <span className="font-mono text-base text-slate-600">{generatedIp}</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
                <i className="fas fa-user text-xl"></i>
              </div>
              <div className="flex-1">
                <label
                  htmlFor="fixedNickname"
                  className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1"
                >
                  닉네임 입력
                </label>
                <input
                  type="text"
                  id="fixedNickname"
                  value={fixedNickname}
                  onChange={e => onFixedNicknameChange(e.target.value)}
                  placeholder="멋진 닉네임을 입력하세요"
                  maxLength={10}
                  className={`w-full px-4 py-2 bg-white border rounded-lg focus:outline-none focus:ring-2 transition-all font-bold text-slate-700 placeholder-slate-300 ${
                    errors.fixedNickname
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-200 bg-red-50'
                      : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                  }`}
                  aria-invalid={!!errors.fixedNickname}
                  aria-describedby={errors.fixedNickname ? 'fixed-nickname-error' : undefined}
                />
              </div>
            </div>
            {errors.fixedNickname && (
              <p
                id="fixed-nickname-error"
                role="alert"
                className="text-xs text-red-500 font-medium pl-16"
              >
                <i className="fas fa-exclamation-circle mr-1" aria-hidden="true"></i>
                {errors.fixedNickname}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <label htmlFor="userReputation" className="block text-sm font-bold text-slate-700">
              갤러리 내 인지도/호감도
            </label>
            <InfoTooltip text="내가 글이나 댓글을 썼을 때, 다른 유저(AI)들이 나를 어떻게 대할지 설정합니다. '비호감'일수록 공격적인 반응이 많아집니다." />
          </div>
          <span className={`text-sm font-bold ${reputationInfo.color}`}>
            {reputationInfo.text} ({userReputation})
          </span>
        </div>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <input
            type="range"
            id="userReputation"
            min="0"
            max="100"
            step="5"
            value={userReputation}
            onChange={e => onUserReputationChange(Number(e.target.value))}
            className="w-full h-2 bg-gradient-to-r from-red-400 via-slate-300 to-blue-500 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="mt-2 flex justify-between px-1 text-xs font-medium text-slate-600">
            <span>욕받이 (0)</span>
            <span>평범 (50)</span>
            <span>네임드 (100)</span>
          </div>
        </div>
      </div>

      {nicknameType === 'FIXED' && (
        <p className="text-xs text-indigo-500 text-center bg-indigo-50 py-2 rounded-lg border border-indigo-100">
          <i className="fas fa-info-circle mr-1"></i>
          고정닉 사용 시 AI가 유저를 '네임드 유저'로 인식할 확률이 높아집니다.
        </p>
      )}
    </div>
  );
};
