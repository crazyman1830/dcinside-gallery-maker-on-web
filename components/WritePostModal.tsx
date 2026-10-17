import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { MAX_COMMENT_AUTHOR_LENGTH } from '../constants';
import { UserProfile } from '../types';
import { resolveUserNickname } from '../utils/common';
import { Icon } from './Icon';

interface WritePostModalProps {
  isOpen: boolean;
  currentUserProfile: UserProfile | null;
  onClose: () => void;
  onSave: (title: string, author: string, content: string) => Promise<boolean>;
  isSaving: boolean;
  submissionError?: string | null;
}

const MAX_TITLE_LENGTH = 50;
const MAX_CONTENT_LENGTH = 500;

const MEDIA_SNIPPETS = [
  { type: '사진', label: '사진 설명 넣기', icon: 'fas fa-image' },
  { type: '동영상', label: '동영상 설명 넣기', icon: 'fas fa-film' },
  { type: '콘', label: '디시콘 넣기', icon: 'far fa-smile' },
] as const;

const validateRequired = (value: string, label: string, maxLength: number): string => {
  if (!value.trim()) return `${label}을 입력해주세요.`;
  if (value.length > maxLength) return `${label}은 ${maxLength}자 이내로 입력해주세요.`;
  return '';
};

export const WritePostModal: React.FC<WritePostModalProps> = ({
  isOpen,
  currentUserProfile,
  onClose,
  onSave,
  isSaving,
  submissionError,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [titleError, setTitleError] = useState('');
  const [authorError, setAuthorError] = useState('');
  const [contentError, setContentError] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const keepWritingRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const authorInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const isProfileSet = !!currentUserProfile;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      triggerElementRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTitle('');
      setAuthor(resolveUserNickname(currentUserProfile));
      setContent('');
      setTitleError('');
      setAuthorError('');
      setContentError('');
      setSaveFailed(false);
      setConfirmingDiscard(false);
      dialog.showModal();
      wasOpenRef.current = true;
      requestAnimationFrame(() => titleInputRef.current?.focus());
      return;
    }

    if (!isOpen && dialog.open) dialog.close();
    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      requestAnimationFrame(() => triggerElementRef.current?.focus());
    }
  }, [currentUserProfile, isOpen]);

  useEffect(
    () => () => {
      if (wasOpenRef.current) triggerElementRef.current?.focus();
    },
    [],
  );

  const isDirty = title.trim() !== '' || content.trim() !== '';

  const requestClose = () => {
    if (isSaving) return;
    if (isDirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      requestAnimationFrame(() => keepWritingRef.current?.focus());
      return;
    }
    onClose();
  };

  const insertMediaSnippet = (type: (typeof MEDIA_SNIPPETS)[number]['type']) => {
    const textarea = contentInputRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    // Pictures and videos render as blocks, so start them on their own line.
    const lineBreak = type !== '콘' && before && !before.endsWith('\n') ? '\n' : '';
    const snippet = `${lineBreak}(${type}: )`;
    const next = `${before}${snippet}${content.slice(end)}`;
    if (next.length > MAX_CONTENT_LENGTH) return;
    setContent(next);
    setConfirmingDiscard(false);
    if (contentError) setContentError(validateRequired(next, '내용', MAX_CONTENT_LENGTH));
    const caret = start + snippet.length - 1;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });
  };

  const validate = (): boolean => {
    const nextTitleError = validateRequired(title, '제목', MAX_TITLE_LENGTH);
    const nextAuthorError = validateRequired(author, '닉네임', MAX_COMMENT_AUTHOR_LENGTH + 8);
    const nextContentError = validateRequired(content, '내용', MAX_CONTENT_LENGTH);
    setTitleError(nextTitleError);
    setAuthorError(nextAuthorError);
    setContentError(nextContentError);
    if (nextTitleError) titleInputRef.current?.focus();
    else if (nextAuthorError) authorInputRef.current?.focus();
    else if (nextContentError) contentInputRef.current?.focus();
    return !nextTitleError && !nextAuthorError && !nextContentError;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setSaveFailed(false);
    if (!validate()) return;

    try {
      const saved = await onSave(title.trim(), author.trim(), content.trim());
      if (!saved) setSaveFailed(true);
    } catch {
      setSaveFailed(true);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
      aria-labelledby="write-post-modal-title"
      onCancel={event => {
        event.preventDefault();
        requestClose();
      }}
    >
      <form onSubmit={handleSave} className="flex max-h-[90vh] flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6 sm:py-5">
          <h2
            id="write-post-modal-title"
            className="flex items-center gap-2 text-xl font-bold text-slate-800"
          >
            <Icon icon="fas fa-pen-nib" className="text-blue-600" /> 새 글 작성
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="닫기"
          >
            <Icon icon="fas fa-times" className="text-lg" />
          </button>
        </div>

        {saveFailed && (
          <p
            id="post-save-error"
            role="alert"
            className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:mx-6"
          >
            <Icon icon="fas fa-exclamation-circle" className="mr-2" />
            {submissionError || '글을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.'}
          </p>
        )}

        {confirmingDiscard && (
          <div
            role="alert"
            className="mx-5 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6"
          >
            <p className="font-medium">작성 중인 내용이 사라집니다. 창을 닫을까요?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                ref={keepWritingRef}
                type="button"
                onClick={() => setConfirmingDiscard(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                계속 작성
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                작성 취소하고 닫기
              </button>
            </div>
          </div>
        )}

        <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
          <div>
            <label htmlFor="postTitle" className="mb-2 block text-sm font-bold text-slate-700">
              제목
            </label>
            <input
              ref={titleInputRef}
              type="text"
              id="postTitle"
              value={title}
              onChange={event => {
                const nextValue = event.target.value;
                setTitle(nextValue);
                setSaveFailed(false);
                setConfirmingDiscard(false);
                if (titleError)
                  setTitleError(validateRequired(nextValue, '제목', MAX_TITLE_LENGTH));
              }}
              className={`w-full rounded-xl border bg-slate-50 px-4 py-3 text-slate-700 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-500/20 ${titleError ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-500'}`}
              maxLength={MAX_TITLE_LENGTH}
              placeholder="흥미로운 제목을 입력하세요"
              aria-invalid={!!titleError}
              aria-describedby={titleError ? 'post-title-error' : undefined}
              aria-required="true"
            />
            {titleError && (
              <p
                id="post-title-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {titleError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="postAuthor" className="mb-2 block text-sm font-bold text-slate-700">
              닉네임
            </label>
            <input
              ref={authorInputRef}
              type="text"
              id="postAuthor"
              value={author}
              onChange={event => {
                const nextValue = event.target.value;
                setAuthor(nextValue);
                setSaveFailed(false);
                if (authorError)
                  setAuthorError(
                    validateRequired(nextValue, '닉네임', MAX_COMMENT_AUTHOR_LENGTH + 8),
                  );
              }}
              readOnly={isProfileSet}
              className={`w-full rounded-xl border px-4 py-3 text-slate-700 outline-none transition-colors focus:ring-2 focus:ring-blue-500/20 ${authorError ? 'border-red-500 bg-red-50' : 'border-slate-200'} ${isProfileSet ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-slate-50 focus:border-blue-500 focus:bg-white'}`}
              placeholder="닉네임"
              aria-invalid={!!authorError}
              aria-required="true"
              aria-describedby={
                [authorError ? 'post-author-error' : '', isProfileSet ? 'post-author-help' : '']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
            {isProfileSet && (
              <p id="post-author-help" className="mt-1.5 text-xs text-slate-500">
                갤러리 설정에서 지정된 프로필을 사용합니다.
              </p>
            )}
            {authorError && (
              <p
                id="post-author-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {authorError}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="postContent" className="block text-sm font-bold text-slate-700">
                내용
              </label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="미디어 묘사 넣기">
                {MEDIA_SNIPPETS.map(snippet => (
                  <button
                    key={snippet.type}
                    type="button"
                    onClick={() => insertMediaSnippet(snippet.type)}
                    disabled={content.length + snippet.type.length + 5 > MAX_CONTENT_LENGTH}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
                    title={`본문에 (${snippet.type}: 설명) 형식을 넣습니다.`}
                  >
                    <Icon icon={snippet.icon} />
                    {snippet.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={contentInputRef}
              id="postContent"
              value={content}
              onChange={event => {
                const nextValue = event.target.value;
                setContent(nextValue);
                setSaveFailed(false);
                setConfirmingDiscard(false);
                if (contentError)
                  setContentError(validateRequired(nextValue, '내용', MAX_CONTENT_LENGTH));
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={8}
              className={`min-h-[150px] w-full resize-y rounded-xl border bg-slate-50 px-4 py-3 text-slate-700 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-500/20 ${contentError ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-500'}`}
              maxLength={MAX_CONTENT_LENGTH}
              placeholder="내용을 자유롭게 작성하세요."
              aria-invalid={!!contentError}
              aria-required="true"
              aria-describedby={
                contentError ? 'post-content-error post-content-count' : 'post-content-count'
              }
            />
            <div className="mt-1.5 flex justify-between gap-3">
              {contentError ? (
                <p
                  id="post-content-error"
                  role="alert"
                  className="text-xs font-medium text-red-600"
                >
                  {contentError}
                </p>
              ) : (
                <span />
              )}
              <p id="post-content-count" className="text-xs text-slate-600">
                {content.length}/{MAX_CONTENT_LENGTH}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex min-w-28 items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <LoadingSpinner small />
                <span className="sr-only">등록 중</span>
              </>
            ) : (
              <>
                <Icon icon="fas fa-check" className="mr-2" /> 등록하기
              </>
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
};
