// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FloatingWarning, FloatingWarnings, WARNING_COLLAPSE_MS } from './FloatingWarnings';

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
