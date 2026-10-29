// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { demoActivities } from '../../test/activities.fixture';
import { SnoozedPage, SnoozeDialog } from './WorkspaceStates';
import { defaultWorkspace, nextMorning } from '../../core/workspace';
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

describe('snoozed activity lookup and selection', () => {
  it('uses the first live revision before saved fallback and keeps deadline order and recovery selection', () => {
    const first = {
      ...demoActivities.inbox[0],
      id: 'first',
      number: 1,
      title: 'Live first revision',
    };
    const laterDuplicate = { ...first, title: 'Duplicate must not win' };
    const saved = { ...demoActivities.inbox[1], id: 'saved', number: 2, title: 'Saved fallback' };
    const restored = {
      ...demoActivities.inbox[2],
      id: 'restored',
      number: 3,
      title: 'Restored record',
    };
    const data = {
      ...defaultWorkspace(),
      snoozed: { saved: now + 7200000, first: now + 3600000, missing: now + 1 },
      snoozeRecords: { first: { ...first, title: 'Outdated saved revision' }, saved, restored },
      restored: ['restored'],
    };
    const props = {
      data,
      records: [first, laterDuplicate],
      onRestore: vi.fn(),
      onAdjust: vi.fn(),
      onOpen: vi.fn(),
    };
    const { rerender } = render(<SnoozedPage {...props} />);
    expect(screen.getByRole('button', { name: '已稍后处理 2' })).toBeTruthy();
    expect(screen.queryByText('Duplicate must not win', { exact: false })).toBeNull();
    expect(screen.queryByText('Outdated saved revision', { exact: false })).toBeNull();
    expect(
      screen.getAllByRole('checkbox').map((checkbox) => checkbox.getAttribute('aria-label')),
    ).toEqual(['选择 #1', '选择 #2']);
    fireEvent.click(screen.getByRole('button', { name: /#1/ }));
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: first.title }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 #1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 #2' }));
    fireEvent.click(screen.getByRole('button', { name: '调整时间' }));
    expect(props.onAdjust).toHaveBeenCalledWith(['first', 'saved']);
    rerender(<SnoozedPage {...props} data={{ ...data, snoozed: { saved: now + 7200000 } }} />);
    fireEvent.click(screen.getByRole('button', { name: '恢复选中条目' }));
    expect(props.onRestore).toHaveBeenCalledWith(['saved']);
    expect(
      (screen.getByRole('button', { name: '恢复选中条目' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '最近恢复' }));
    expect(screen.getByRole('button', { name: /#3/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '恢复选中条目' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 #3' }));
    fireEvent.click(screen.getByRole('button', { name: '已稍后处理 1' }));
    expect((screen.getByRole('checkbox', { name: '选择 #2' }) as HTMLInputElement).checked).toBe(
      false,
    );
  });
});
