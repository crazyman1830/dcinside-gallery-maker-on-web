// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentSection } from '../components/CommentSection';
import { FormSection } from '../components/FormSection';
import { GalleryHeader } from '../components/GalleryHeader';
import { InfoTooltip } from '../components/InfoTooltip';
import { WritePostModal } from '../components/WritePostModal';
import type { Post } from '../types';

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

const restoreDialogMethod = (name: 'showModal' | 'close', descriptor?: PropertyDescriptor) => {
  if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreDialogMethod('showModal', originalShowModal);
  restoreDialogMethod('close', originalClose);
});

const post: Post = {
  id: 'post-1',
  title: '접근성 테스트 게시물',
  author: '작성자',
  timestamp: '2026-08-14T00:00:00.000Z',
  content: '게시물 본문',
  views: 12,
  recommendations: 3,
  nonRecommendations: 1,
  comments: [],
  voted: null,
};

const AccordionFixture = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <FormSection
      title="테스트 설정"
      iconClass="fas fa-cog"
      id="test-section"
      isOpen={isOpen}
      onToggle={() => setIsOpen(previous => !previous)}
    >
      <label htmlFor="hidden-field">숨겨진 입력</label>
      <input id="hidden-field" />
    </FormSection>
  );
};

describe('frontend accessibility primitives', () => {
  it('exposes the worldline badge and its multiverse explanation to keyboard users', () => {
    render(<GalleryHeader galleryTitle="gallery" worldlineId="WL-1111-2222-3333" />);

    const badge = screen.getByLabelText(
      /세계선 WL-1111-2222-3333.*생성본 사이의 용어 차이.*평행세계의 변형/,
    );
    expect(badge).toHaveTextContent('세계선 WL-1111-2222-3333');
    fireEvent.click(badge);
    expect(badge.closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('note')).toHaveTextContent(
      '같은 설정으로 다시 생성했을 때 생기는 용어 차이는 평행세계의 변형',
    );
  });

  it('removes closed accordion content from the DOM and restores it when opened', async () => {
    const user = userEvent.setup();
    render(<AccordionFixture />);

    const toggle = screen.getByRole('button', { name: '테스트 설정' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('숨겨진 입력')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('숨겨진 입력')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByLabelText('숨겨진 입력')).not.toBeInTheDocument();
  });

  it('opens the help tooltip from the keyboard and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<InfoTooltip text="도움말 본문" />);

    const trigger = screen.getByRole('button', { name: '도움말' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tooltip')).toHaveTextContent('도움말 본문');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('preserves a new comment draft typed while the submitted comment is still processing', async () => {
    const user = userEvent.setup();
    let resolveComment!: () => void;
    const pendingComment = new Promise<void>(resolve => {
      resolveComment = resolve;
    });
    const onAddComment = vi.fn(() => pendingComment);
    render(
      <CommentSection
        postId={post.id}
        comments={[]}
        currentUserProfile={null}
        onAddComment={onAddComment}
        isAddingComment={false}
        maxComments={10}
        currentCommentCount={0}
        highlightedCommentIds={new Set()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '댓글 작성자 닉네임' }), '독자');
    const comment = screen.getByRole('textbox', { name: '댓글 내용' });
    await user.type(comment, '제출할 댓글');
    await user.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(comment).toHaveValue(''));

    await user.type(comment, '다음 댓글 초안');
    await act(async () => {
      resolveComment();
      await pendingComment;
    });

    expect(onAddComment).toHaveBeenCalledWith(post.id, '제출할 댓글', '독자', undefined);
    expect(comment).toHaveValue('다음 댓글 초안');
  });

  it('shows the precise post submission failure inside the open modal', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(
      <WritePostModal
        isOpen
        currentUserProfile={null}
        onClose={vi.fn()}
        onSave={onSave}
        isSaving={false}
        submissionError="서버가 반환한 상세 오류"
      />,
    );

    const title = screen.getByLabelText('제목');
    expect(title).toHaveAttribute('aria-required', 'true');
    await user.type(title, '새 게시물');
    await user.type(screen.getByLabelText('닉네임'), '작성자');
    await user.type(screen.getByLabelText('내용'), '게시물 내용');
    await user.click(screen.getByRole('button', { name: '등록하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('서버가 반환한 상세 오류');
    expect(title).toHaveValue('새 게시물');
  });
});
