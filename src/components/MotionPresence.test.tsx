// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MotionPresence } from './MotionPresence';
import { FloatingWarning, FloatingWarnings } from './FloatingWarnings';
import { Modal } from './Modal';

let finish: () => void;
let reject: (reason?: unknown) => void;
let cancel: ReturnType<typeof vi.fn>;
let animate: ReturnType<typeof vi.fn>;
let media: EventTarget & { matches: boolean };
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => media);
  cancel = vi.fn();
  animate = vi.fn(() => ({
    finished: new Promise<void>((resolve, rejectExit) => {
      finish = resolve;
      reject = rejectExit;
    }),
    cancel,
  }));
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
});
afterEach(() => {
  cleanup();
  delete (Element.prototype as Partial<Element>).animate;
  delete (Element.prototype as Partial<Element>).getAnimations;
  vi.unstubAllGlobals();
});

function Surface({ open, reduced = false }: { open: boolean; reduced?: boolean }) {
  return (
    <div className={`workspace-root ${reduced ? 'reduced-motion' : ''}`}>
      <MotionPresence>{open && <section data-testid="surface">Content</section>}</MotionPresence>
    </div>
  );
}

it('retains a noninteractive exit surface only until its animation completes', async () => {
  const { rerender } = render(<Surface open />);
  rerender(<Surface open={false} />);
  expect(animate).toHaveBeenCalledOnce();
  expect(screen.getByTestId('surface').inert).toBe(true);
  expect(screen.getByTestId('surface').closest('[aria-hidden="true"]')).not.toBeNull();
  await act(async () => finish());
  expect(screen.queryByTestId('surface')).toBeNull();
});

it.each(['app', 'system'])('removes the surface immediately when %s reduces motion', (source) => {
  media.matches = source === 'system';
  const { rerender } = render(<Surface open reduced={source === 'app'} />);
  rerender(<Surface open={false} reduced={source === 'app'} />);
  expect(animate).not.toHaveBeenCalled();
  expect(screen.queryByTestId('surface')).toBeNull();
});

it('cancels a pending exit when reopened and ignores its late completion', async () => {
  const { rerender } = render(<Surface open />);
  rerender(<Surface open={false} />);
  rerender(<Surface open />);
  expect(cancel).toHaveBeenCalled();
  await act(async () => finish());
  expect(screen.getByTestId('surface').inert).toBe(false);
});

it('ends an exit immediately when system reduced motion turns on', () => {
  const { rerender } = render(<Surface open />);
  rerender(<Surface open={false} />);
  media.matches = true;
  act(() => media.dispatchEvent(new Event('change')));
  expect(cancel).toHaveBeenCalled();
  expect(screen.queryByTestId('surface')).toBeNull();
});

it('ends an exit immediately when app reduced motion turns on', async () => {
  const { rerender } = render(<Surface open />);
  rerender(<Surface open={false} />);
  await act(async () => rerender(<Surface open={false} reduced />));
  expect(cancel).toHaveBeenCalled();
  expect(screen.queryByTestId('surface')).toBeNull();
});

it('cleans up the retained surface when an animation is interrupted externally', async () => {
  const { rerender } = render(<Surface open />);
  rerender(<Surface open={false} />);
  await act(async () => reject(new DOMException('Cancelled', 'AbortError')));
  expect(screen.queryByTestId('surface')).toBeNull();
});

it('animates the dock away when its final warning is resolved', async () => {
  function Notices({ show }: { show: boolean }) {
    return (
      <div className="workspace-root">
        <FloatingWarnings>
          {show && (
            <FloatingWarning title="Sync failed">
              <p>Retry later</p>
            </FloatingWarning>
          )}
        </FloatingWarnings>
      </div>
    );
  }
  const { rerender } = render(<Notices show />);
  expect(screen.getByRole('alert')).toBeTruthy();
  rerender(<Notices show={false} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.querySelector('.floating-warnings')).not.toBeNull();
  expect(animate).toHaveBeenCalledOnce();
  await act(async () => finish());
  expect(document.querySelector('.floating-warnings')).toBeNull();
});

it('continues from an interrupted entry frame and leaves backdrop animations running', () => {
  const { rerender } = render(<Surface open />);
  const surface = screen.getByTestId('surface');
  surface.style.opacity = '0.35';
  surface.style.transform = 'translateY(3px)';
  const cancelEntry = vi.fn(() => {
    surface.style.opacity = '1';
  });
  const cancelBackdrop = vi.fn();
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [
      { cancel: cancelEntry, effect: { pseudoElement: null } },
      { cancel: cancelBackdrop, effect: { pseudoElement: '::backdrop' } },
    ],
  });
  rerender(<Surface open={false} />);
  expect(cancelEntry).toHaveBeenCalledOnce();
  expect(cancelBackdrop).not.toHaveBeenCalled();
  expect(animate.mock.calls[0][0][0]).toEqual({ opacity: '0.35', transform: 'translateY(3px)' });
});

it('moves a closing PR preview toward its entry edge', () => {
  const { rerender } = render(
    <MotionPresence>
      <aside className="pr-preview">Preview</aside>
    </MotionPresence>,
  );
  rerender(<MotionPresence>{null}</MotionPresence>);
  expect(animate.mock.calls[0][0][1]).toEqual({ opacity: 0, transform: 'translateX(8px)' });
});

it('restores the dialog trigger focus after its exit finishes', async () => {
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
  function Dialog() {
    const [open, setOpen] = useState(false);
    return (
      <div className="workspace-root">
        <button onClick={() => setOpen(true)}>Open dialog</button>
        <MotionPresence>
          {open && (
            <Modal title="Example" onClose={() => setOpen(false)}>
              Content
            </Modal>
          )}
        </MotionPresence>
      </div>
    );
  }
  render(<Dialog />);
  const trigger = screen.getByRole('button', { name: 'Open dialog' });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }));
  expect(document.querySelector('dialog')).not.toBeNull();
  await act(async () => finish());
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
