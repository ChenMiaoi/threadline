// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterEach(cleanup);

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Choose repository</button>
      {open && (
        <Modal title="Repositories" onClose={() => setOpen(false)}>
          Repository list
        </Modal>
      )}
    </>
  );
}

describe('modal focus', () => {
  it.each(['Escape', 'close button'])(
    'restores focus to the trigger after %s under Strict Mode',
    (method) => {
      render(
        <StrictMode>
          <Example />
        </StrictMode>,
      );
      const trigger = screen.getByRole('button', { name: 'Choose repository' });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
      if (method === 'Escape')
        fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
      else fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      fireEvent.click(trigger);
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    },
  );

  it.each(['removed', 'disabled', 'inert'])('does not focus a trigger that became %s', (state) => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const focus = vi.spyOn(trigger, 'focus');
    const { unmount } = render(
      <Modal title="Repositories" onClose={() => {}}>
        Repository list
      </Modal>,
    );
    if (state === 'removed') trigger.remove();
    if (state === 'disabled') trigger.disabled = true;
    if (state === 'inert') trigger.setAttribute('inert', '');
    unmount();
    expect(focus).not.toHaveBeenCalled();
    trigger.remove();
  });
});
