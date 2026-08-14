// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FormSection } from '../components/FormSection';
import { InfoTooltip } from '../components/InfoTooltip';

afterEach(cleanup);

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
});
