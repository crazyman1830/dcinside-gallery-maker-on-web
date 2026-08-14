// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryCreationForm } from '../components/GalleryCreationForm';
import { getAiCredentialStatus, type AiCredentialStatus } from '../services/aiCredentialClient';

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

const credentialStatus: AiCredentialStatus = {
  providers: {
    gemini: { configured: true },
    vertex: { configured: false },
  },
};

beforeEach(() => {
  vi.mocked(getAiCredentialStatus).mockReset().mockResolvedValue(credentialStatus);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('gallery form validation', () => {
  it('does not poll credential status after opening advanced settings', async () => {
    const user = userEvent.setup();
    let resolveAdvancedStatus!: (status: AiCredentialStatus) => void;
    const advancedStatus = new Promise<AiCredentialStatus>(resolve => {
      resolveAdvancedStatus = resolve;
    });
    vi.mocked(getAiCredentialStatus)
      .mockReset()
      .mockResolvedValueOnce(credentialStatus)
      .mockImplementationOnce(() => advancedStatus)
      .mockResolvedValue(credentialStatus);

    render(<GalleryCreationForm isLoading={false} onSubmit={vi.fn()} setFormError={vi.fn()} />);
    await waitFor(() => expect(getAiCredentialStatus).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '고급 설정' }));
    await waitFor(() => expect(getAiCredentialStatus).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveAdvancedStatus(credentialStatus);
      await advancedStatus;
    });
    await act(async () => Promise.resolve());

    expect(getAiCredentialStatus).toHaveBeenCalledTimes(2);
  });

  it('opens generation options and focuses the topic on the first invalid submit', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const setFormError = vi.fn();
    render(
      <GalleryCreationForm isLoading={false} onSubmit={onSubmit} setFormError={setFormError} />,
    );

    const optionsToggle = screen.getByRole('button', { name: '주제와 현재 떡밥' });
    await user.click(optionsToggle);
    expect(screen.queryByLabelText(/갤러리 주제/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '갤러리 생성' }));

    const topic = await screen.findByLabelText(/갤러리 주제/);
    await waitFor(() => expect(topic).toHaveFocus());
    expect(topic).toHaveAttribute('aria-invalid', 'true');
    expect(topic).toHaveAttribute('aria-describedby', 'topic-error');
    expect(screen.getByRole('alert')).toHaveTextContent('주제를 입력해주세요.');
    expect(setFormError).toHaveBeenLastCalledWith(null);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
