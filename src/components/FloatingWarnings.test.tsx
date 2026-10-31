// @vitest-environment jsdom
import { Modal } from './Modal';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  FloatingUpdate,
  FloatingWarning,
  FloatingInfo,
  FloatingWarnings,
  WARNING_COLLAPSE_MS,
} from './FloatingWarnings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Example({
  error = 'Network unavailable',
  second = false,
}: {
  error?: string;
  second?: boolean;
}) {
  return (
    <FloatingWarnings>
      <main>
        <h1>Inbox</h1>
      </main>
      {error && (
        <FloatingWarning title="Sync failed">
          <p>{error}</p>
          <button>Retry</button>
        </FloatingWarning>
      )}
      {second && (
        <FloatingWarning title="Save failed">
          <button>Retry save</button>
        </FloatingWarning>
      )}
    </FloatingWarnings>
  );
}

it('keeps warnings outside page content, minimizes automatically and restores their actions', () => {
  vi.useFakeTimers();
  render(<Example />);
  expect(document.querySelector('main [role="alert"]')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Network unavailable');
  act(() => {
    vi.advanceTimersByTime(WARNING_COLLAPSE_MS);
  });
  expect(screen.queryByRole('alert')).toBeNull();
  const button = screen.getByRole('button', { name: '查看提醒（1）' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

it('pauses collapse while reading or using controls and removes resolved warnings', () => {
  vi.useFakeTimers();
  const view = render(<Example />);
  const dock = screen.getByRole('complementary', { name: '应用提醒' });
  fireEvent.mouseEnter(dock);
  act(() => {
    vi.advanceTimersByTime(WARNING_COLLAPSE_MS * 2);
  });
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.mouseLeave(dock);
  act(() => {
    vi.advanceTimersByTime(WARNING_COLLAPSE_MS);
  });
  expect(screen.queryByRole('alert')).toBeNull();
  view.rerender(<Example error="" />);
  expect(screen.queryByRole('complementary', { name: '应用提醒' })).toBeNull();
});

it('preserves collapsed state during status refreshes and expands newly added warnings', () => {
  const view = render(<Example />);
  fireEvent.click(screen.getByRole('button', { name: '收起提醒' }));
  view.rerender(<Example error="Still unavailable" />);
  expect(screen.queryByRole('alert')).toBeNull();
  view.rerender(<Example error="Still unavailable" second />);
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Retry save' })).toBeTruthy();
});

it('shows an update as a polite floating notice and retains its action after collapsing', () => {
  vi.useFakeTimers();
  const open = vi.fn();
  render(
    <FloatingWarnings>
      <main>
        <h1>Inbox</h1>
      </main>
      <FloatingUpdate title="Version 0.1.4-rc.2">
        <button onClick={open}>View update</button>
      </FloatingUpdate>
    </FloatingWarnings>,
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status').getAttribute('data-tone')).toBe('update');
  expect(document.querySelector('main [role="status"]')).toBeNull();
  expect(screen.getByText('更新提示')).toBeTruthy();
  act(() => vi.advanceTimersByTime(WARNING_COLLAPSE_MS));
  const launcher = screen.getByRole('button', { name: '查看提醒（1）' });
  expect(launcher.getAttribute('data-tone')).toBe('update');
  expect(launcher.textContent).toContain('↑');
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(launcher);
  fireEvent.click(screen.getByRole('button', { name: 'View update' }));
  expect(open).toHaveBeenCalledOnce();
});

it('keeps warning and update semantics distinct in the same dock', () => {
  render(
    <FloatingWarnings>
      <FloatingWarning title="Sync failed">
        <p>Offline</p>
      </FloatingWarning>
      <FloatingUpdate title="New version">
        <p>Ready to download</p>
      </FloatingUpdate>
    </FloatingWarnings>,
  );
  expect(screen.getByRole('alert').textContent).toContain('Offline');
  expect(screen.getByRole('status').textContent).toContain('Ready to download');
  expect(screen.getByRole('button', { name: '查看提醒（2）' }).getAttribute('data-tone')).toBe(
    'warning',
  );
});

it('routes information into the same dock without calling it an update', async () => {
  render(
    <FloatingWarnings>
      <FloatingInfo title="Action completed">
        <p>Saved</p>
      </FloatingInfo>
    </FloatingWarnings>,
  );
  const dock = screen.getByRole('complementary', { name: '应用提醒' });
  expect(within(dock).getByRole('status').textContent).toContain('Saved');
  expect(within(dock).getByText('应用提醒')).toBeTruthy();
  expect(within(dock).queryByText('更新提示')).toBeNull();
});

it('keeps the dock inside the active modal top layer and restores it after closing', () => {
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
  const view = render(
    <FloatingWarnings>
      <FloatingWarning title="Sync failed">
        <p>Retained outside dialog</p>
      </FloatingWarning>
      <Modal title="Choose repository" onClose={() => {}}>
        Picker
      </Modal>
    </FloatingWarnings>,
  );
  expect(screen.getByRole('dialog').querySelector('.floating-warnings')).toBeTruthy();
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain(
    'Sync failed',
  );
  view.rerender(
    <FloatingWarnings>
      <FloatingWarning title="Sync failed">
        <p>Retained outside dialog</p>
      </FloatingWarning>
    </FloatingWarnings>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('complementary', { name: '应用提醒' })).toBeTruthy();
});
