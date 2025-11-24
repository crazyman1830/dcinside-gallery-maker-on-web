
import React, { useState, useEffect, useRef } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { MAX_COMMENT_AUTHOR_LENGTH } from '../constants';
import { UserProfile } from '../types';
import { resolveUserNickname } from '../utils/common';

interface WritePostModalProps {
  isOpen: boolean;
  currentUserProfile: UserProfile | null;
  onClose: () => void;
  onSave: (title: string, author: string, content: string) => Promise<void>;
  isSaving: boolean;
}

const MAX_TITLE_LENGTH = 50;
const MAX_CONTENT_LENGTH = 500;

export const WritePostModal: React.FC<WritePostModalProps> = ({ isOpen, currentUserProfile, onClose, onSave, isSaving }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [titleError, setTitleError] = useState('');
  const [authorError, setAuthorError] = useState('');
  const [contentError, setContentError] = useState('');
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const triggerElementRef = useRef<Element | null>(null);

  const isProfileSet = !!currentUserProfile;

  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
      titleInputRef.current?.focus();

      setTitle('');
      
      // Initialize author from profile
      const initialAuthor = resolveUserNickname(currentUserProfile);
      setAuthor(initialAuthor);

      setContent('');
      setTitleError('');
      setAuthorError('');
      setContentError('');
    } else if (triggerElementRef.current) {
        (triggerElementRef.current as HTMLElement).focus();
    }
  }, [isOpen, currentUserProfile]);

  const validate = (): boolean => {
    let isValid = true;
    if (!title.trim()) {
      setTitleError('제목을 입력해주세요.');
      isValid = false;
    } else if (title.length > MAX_TITLE_LENGTH) {
      setTitleError(`제목은 ${MAX_TITLE_LENGTH}자 이내로 입력해주세요.`);
      isValid = false;
    } else {
      setTitleError('');
    }

    if (!author.trim()) {
      setAuthorError('닉네임을 입력해주세요.');
      isValid = false;
    } else if (author.length > MAX_COMMENT_AUTHOR_LENGTH + 8) {
      setAuthorError(`닉네임이 너무 깁니다.`);
      isValid = false;
    } else {
      setAuthorError('');
    }

    if (!content.trim()) {
      setContentError('내용을 입력해주세요.');
      isValid = false;
    } else if (content.length > MAX_CONTENT_LENGTH) {
      setContentError(`내용은 ${MAX_CONTENT_LENGTH}자 이내로 입력해주세요.`);
      isValid = false;
    } else {
      setContentError('');
    }
    return isValid;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }
    await onSave(title, author, content);
  };

  if (!isOpen) {
    return null;
  }

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-700 placeholder-slate-400 outline-none";
  const labelClass = "block text-sm font-bold text-slate-700 mb-2";

  return (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="write-post-modal-title"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl transform transition-all flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()} 
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <h2 id="write-post-modal-title" className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fas fa-pen-nib text-blue-600"></i> 새 글 작성
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
            aria-label="닫기"
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div>
            <label htmlFor="postTitle" className={labelClass}>제목</label>
            <input
              ref={titleInputRef}
              type="text"
              id="postTitle"
              value={title}
              onChange={(e) => {setTitle(e.target.value); if(titleError) validate();}}
              className={`${inputClass} ${titleError ? 'border-red-500 bg-red-50' : ''}`}
              maxLength={MAX_TITLE_LENGTH}
              placeholder="흥미로운 제목을 입력하세요"
            />
            {titleError && <p className="mt-1.5 text-xs text-red-500 font-medium"><i className="fas fa-exclamation-circle mr-1"></i>{titleError}</p>}
          </div>

          <div>
            <label htmlFor="postAuthor" className={labelClass}>닉네임</label>
            <div className="relative">
                <input
                type="text"
                id="postAuthor"
                value={author}
                onChange={(e) => {setAuthor(e.target.value); if(authorError) validate();}}
                readOnly={isProfileSet}
                className={`${inputClass} ${authorError ? 'border-red-500 bg-red-50' : ''} ${isProfileSet ? 'cursor-not-allowed text-slate-500 bg-slate-100' : ''}`}
                placeholder="닉네임"
                />
                {isProfileSet && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="text-[10px] text-slate-400 bg-white px-2 py-1 rounded-full border border-slate-200">
                            <i className="fas fa-lock mr-1"></i>고정됨
                        </span>
                    </div>
                )}
            </div>
            {isProfileSet && <p className="text-xs text-slate-400 mt-1.5"><i className="fas fa-info-circle mr-1"></i>갤러리 설정에서 지정된 프로필을 사용합니다.</p>}
            {authorError && <p className="mt-1.5 text-xs text-red-500 font-medium"><i className="fas fa-exclamation-circle mr-1"></i>{authorError}</p>}
          </div>

          <div>
            <label htmlFor="postContent" className={labelClass}>내용</label>
            <textarea
              id="postContent"
              value={content}
              onChange={(e) => {setContent(e.target.value); if(contentError) validate();}}
              rows={8}
              className={`${inputClass} resize-y min-h-[150px] ${contentError ? 'border-red-500 bg-red-50' : ''}`}
              maxLength={MAX_CONTENT_LENGTH}
              placeholder="내용을 자유롭게 작성하세요."
            ></textarea>
            <div className="flex justify-between mt-1.5">
                {contentError ? <p className="text-xs text-red-500 font-medium"><i className="fas fa-exclamation-circle mr-1"></i>{contentError}</p> : <span></span>}
                <p className="text-xs text-slate-400">{content.length}/{MAX_CONTENT_LENGTH}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 bg-slate-50/50 border-t border-slate-100 rounded-b-2xl flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-all"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/30 transition-all flex items-center"
          >
            {isSaving ? <LoadingSpinner small={true} /> : <><i className="fas fa-check mr-2"></i> 등록하기</>}
          </button>
        </div>
      </div>
    </div>
  );
};
