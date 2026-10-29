// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SnoozeDialog } from './WorkspaceStates';
import { nextMorning } from '../../core/workspace';
const now = new Date(2026, 9, 29, 15).getTime();
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('snooze deadlines', () => {
  it('rejects a nonempty past date and accepts a changed future date', () => {
    const confirm = vi.fn();
    render(<SnoozeDialog count={1} onConfirm={confirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '自定义时间' }));
    fireEvent.change(screen.getByLabelText('恢复时间'), { target: { value: '2026-10-28T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存时间' }));
    expect(screen.getByRole('alert').textContent).toBe('请选择未来的时间。');
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('恢复时间'), { target: { value: '2026-10-30T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存时间' }));
    expect(confirm).toHaveBeenCalledWith(new Date(2026, 9, 30, 9).getTime());
  });
  it.each([
    ['1 小时后', now + 3600000],
    ['明天上午 09:00', nextMorning(now)],
    ['下周一 09:00', nextMorning(now, true)],
  ] as const)('submits the selected deadline: %s', (label, deadline) => {
    const confirm = vi.fn();
    render(<SnoozeDialog count={2} onConfirm={confirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: '保存时间' }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(deadline);
  });
});
