// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ActivityPage, ActivityRecord } from './ActivityPage';
import { demoActivities } from '../../test/activities.fixture';
import { issueFromGitHub } from '../../core/github';
import { record, repo, user } from '../../test/github.fixture';
afterEach(cleanup);
describe('activity empty-state recovery', () => {
  it('keeps tab totals independent of search and refreshes them with read and snooze changes', () => {
    const props = {
      view: 'inbox' as const,
      items: demoActivities.inbox,
      repo,
      read: [],
      snoozed: [],
      onRead: vi.fn(),
      onSnooze: vi.fn(),
      onOpen: vi.fn(),
    };
    const { rerender } = render(<ActivityPage {...props} />);
    expect(screen.getByRole('tab', { name: '未读 4' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
      target: { value: 'no matching record' },
    });
    expect(screen.getByRole('tab', { name: '未读 4' })).toBeTruthy();
    rerender(<ActivityPage {...props} read={[props.items[0].id]} snoozed={[props.items[1].id]} />);
    expect(screen.getByRole('tab', { name: '未读 2' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '当前筛选下没有未读更新' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
      target: { value: '' },
    });
    expect(screen.getAllByRole('button', { name: /标记已读/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: '全部' }));
    expect(screen.getByRole('button', { name: '标记未读' })).toBeTruthy();
  });
  it('clears search and labels when requesting all records', () => {
    const items = [
      issueFromGitHub(
        { ...record, labels: { nodes: [{ name: 'crash' }] } },
        user.id,
        repo,
        user.login,
      ),
    ];
    render(
      <ActivityPage
        view="issues"
        items={items}
        repo={repo}
        read={[]}
        onRead={vi.fn()}
        onSnooze={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), {
      target: { value: 'crash' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
      target: { value: 'missing' },
    });
    expect((screen.getByRole('textbox', { name: '搜索协作记录' }) as HTMLInputElement).value).toBe(
      'missing',
    );
    fireEvent.click(screen.getByRole('button', { name: '查看全部记录' }));
    expect((screen.getByRole('textbox', { name: '搜索协作记录' }) as HTMLInputElement).value).toBe(
      '',
    );
    expect((screen.getByRole('combobox', { name: '标签' }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('tab', { name: '全部' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /#1042/ })).toBeTruthy();
  });
});

it('does not identify a restored PR without status metadata as an Issue', () => {
  const legacy = {
    ...issueFromGitHub(record, user.id, repo, user.login),
    kind: 'pull' as const,
    state: undefined,
  };
  render(<ActivityRecord record={legacy} showKind onOpen={vi.fn()} />);
  expect(screen.getByRole('button', { name: /PR #1042/ })).toBeTruthy();
  expect(screen.queryByRole('img', { name: /Issue/ })).toBeNull();
});
