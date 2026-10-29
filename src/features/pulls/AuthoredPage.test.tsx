// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthoredPage } from './AuthoredPage';
import { pullFromGitHub } from '../../core/github';
import { record, repo, user } from '../../test/github.fixture';
afterEach(cleanup);
const pulls = [
  record,
  { ...record, number: 1031, title: 'Another open pull' },
  { ...record, number: 1000, title: 'A merged pull', state: 'MERGED' },
].map((value) => pullFromGitHub(value, user.id, repo));
function mount() {
  render(<AuthoredPage pulls={pulls} repo={repo} onOpen={vi.fn()} read={[]} onRead={vi.fn()} />);
}
describe('authored selection and filtering', () => {
  it('preserves state totals through search and updates totals and read state when props change', () => {
    const props = { pulls, repo, onOpen: vi.fn(), read: [], onRead: vi.fn() };
    const { rerender } = render(<AuthoredPage {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 PR' }), {
      target: { value: '1042' },
    });
    expect(screen.getByRole('tab', { name: /未结束\s*2/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /已合并\s*1/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /#1042/ }));
    fireEvent.click(screen.getByRole('button', { name: '标记已读' }));
    expect(props.onRead).toHaveBeenCalledWith(pulls[0].id);
    rerender(
      <AuthoredPage
        {...props}
        pulls={[pulls[0], { ...pulls[1], state: 'closed' }, pulls[2]]}
        read={[pulls[0].id!]}
      />,
    );
    expect(screen.getByRole('tab', { name: /未结束\s*1/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /已关闭（未合并）\s*1/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: '已读' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps actionable groups first without selecting or previewing a PR by default', () => {
    render(
      <AuthoredPage
        pulls={[{ ...pulls[0], group: '等待评审' }, pulls[1]]}
        repo={repo}
        onOpen={vi.fn()}
        read={[]}
        onRead={vi.fn()}
      />,
    );
    expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 })[0].textContent).toContain('需要我的处理');
    expect(
      (screen.getByRole('button', { name: '显示 PR 预览' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('opens the focused PR with Enter without requiring a double-click', () => {
    const onOpen = vi.fn();
    render(<AuthoredPage pulls={pulls} repo={repo} onOpen={onOpen} read={[]} onRead={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /#1042/ }), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(pulls[0]);
  });
  it('keeps the preview inside the filtered rows after searching', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 PR' }), {
      target: { value: '1042' },
    });
    expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /#1042/ }));
    const preview = within(screen.getByRole('complementary', { name: 'PR 预览' }));
    expect(preview.getByText(/#1042/)).toBeTruthy();
    expect(preview.queryByText(/#1031/)).toBeNull();
  });
  it('shows the selected status rather than a hidden selection from another tab', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
    fireEvent.click(screen.getByRole('tab', { name: /已合并\s*1/ }));
    expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /#1000/ }));
    expect(
      within(screen.getByRole('complementary', { name: 'PR 预览' })).getByText(/#1000/),
    ).toBeTruthy();
  });
  it('does not offer an unrelated discussion when no rows match', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 PR' }), {
      target: { value: 'not-found' },
    });
    expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
  });
  it('closes with Escape and restores row focus, and can reopen the explicitly selected PR', () => {
    mount();
    const row = screen.getByRole('button', { name: /#1031/ });
    fireEvent.click(row);
    const preview = screen.getByRole('complementary', { name: 'PR 预览' });
    expect(document.activeElement).toBe(preview);
    fireEvent.keyDown(preview, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
    expect(document.activeElement).toBe(row);
    fireEvent.click(screen.getByRole('button', { name: '显示 PR 预览' }));
    expect(
      within(screen.getByRole('complementary', { name: 'PR 预览' })).getByText(/#1031/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭 PR 预览' }));
    expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
  });
  it('opens complete details from the preview or by double-click', () => {
    const onOpen = vi.fn();
    render(<AuthoredPage pulls={pulls} repo={repo} onOpen={onOpen} read={[]} onRead={vi.fn()} />);
    const row = screen.getByRole('button', { name: /#1042/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: '打开完整详情' }));
    fireEvent.doubleClick(row);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith(pulls[0]);
  });
});

it('switches status with keyboard tabs and clears the previous preview', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
  const open = screen.getByRole('tab', { name: /未结束/ });
  fireEvent.keyDown(open, { key: 'ArrowRight' });
  const merged = screen.getByRole('tab', { name: /已合并/ });
  expect(document.activeElement).toBe(merged);
  expect(merged.getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('complementary', { name: 'PR 预览' })).toBeNull();
  expect(screen.queryByRole('button', { name: /#1031/ })).toBeNull();
  expect(screen.getByRole('button', { name: /#1000/ })).toBeTruthy();
  const panel = screen.getByRole('tabpanel', { name: /已合并/ });
  expect(panel.id).toBe(merged.getAttribute('aria-controls'));
  fireEvent.keyDown(merged, { key: 'Home' });
  expect(screen.getByRole('button', { name: /#1031/ })).toBeTruthy();
});
