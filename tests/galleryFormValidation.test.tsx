// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryCreationForm } from '../components/GalleryCreationForm';

vi.mock('../services/aiCredentialClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/aiCredentialClient')>();
  return {
    ...actual,
    getAiCredentialStatus: vi.fn().mockResolvedValue({
      providers: {
        gemini: { configured: true },
        vertex: { configured: false },
      },
    }),
  };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('gallery form validation', () => {
  it('opens generation options and focuses the topic on the first invalid submit', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GalleryCreationForm isLoading={false} onSubmit={onSubmit} setFormError={vi.fn()} />);

    const optionsToggle = screen.getByRole('button', { name: '주제와 현재 떡밥' });
    await user.click(optionsToggle);
    expect(screen.queryByLabelText(/갤러리 주제/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '갤러리 생성' }));

    const topic = await screen.findByLabelText(/갤러리 주제/);
    await waitFor(() => expect(topic).toHaveFocus());
    expect(topic).toHaveAttribute('aria-invalid', 'true');
    expect(topic).toHaveAttribute('aria-describedby', 'topic-error');
    expect(screen.getByRole('alert')).toHaveTextContent('주제를 입력해주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
