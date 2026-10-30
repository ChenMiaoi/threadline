// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ActivityPage, ActivityRecord } from './ActivityPage';
import { demoActivities } from '../../test/activities.fixture';
import { describePull } from '../../core/pull-status';
import { issueFromGitHub } from '../../core/github';
import { record, repo, user } from '../../test/github.fixture';
afterEach(cleanup);

it('keeps Issue list rows concise while retaining metadata, opening and Inbox summaries', () => {
  const item = {
    ...issueFromGitHub(record, user.id, repo, user.login),
    summary: 'Latest discussion preview',
    detail: 'contributor · crash',
    labels: ['crash'],
  };
  const props = {
    items: [item],
    repo,
    read: [],
    onRead: vi.fn(),
    onSnooze: vi.fn(),
    onOpen: vi.fn(),
  };
  const { rerender } = render(<ActivityPage key="issues" view="issues" {...props} />);
  expect(screen.queryByText(item.summary)).toBeNull();
  expect(screen.getByText(user.login)).toBeTruthy();
  expect(within(screen.getByRole('button', { name: /#1042/ })).getByText('crash')).toBeTruthy();
  expect(screen.queryByText(item.detail)).toBeNull();
  expect(screen.getByText('开放')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /#1042/ }));
  expect(props.onOpen).toHaveBeenCalledWith(item);
  rerender(<ActivityPage key="inbox" view="inbox" {...props} />);
  expect(screen.getByText(item.summary)).toBeTruthy();
});

it('collapses merged reviews by default but reveals them on demand, search, or the finished tab', () => {
  const merged = {
    ...demoActivities.review[0],
    id: 'merged-review',
    number: 9000,
    title: 'Merged change',
    group: '已合并',
    category: 'finished',
    state: 'merged' as const,
  };
  const onOpen = vi.fn();
  render(
    <ActivityPage
      view="review"
      items={[demoActivities.review[0], merged]}
      repo={repo}
      read={[]}
      onRead={vi.fn()}
      onSnooze={vi.fn()}
      onOpen={onOpen}
    />,
  );
  const toggle = screen.getByRole('button', { name: '已合并 1' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: /#9000/ })).toBeNull();
  expect(
    screen.getByRole('button', { name: new RegExp(`#${demoActivities.review[0].number}`) }),
  ).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /#9000/ }));
  expect(onOpen).toHaveBeenCalledWith(merged);
  fireEvent.click(toggle);
  expect(screen.queryByRole('button', { name: /#9000/ })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
    target: { value: 'Merged change' },
  });
  expect(screen.getByRole('button', { name: /#9000/ })).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
    target: { value: '' },
  });
  expect(screen.queryByRole('button', { name: /#9000/ })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '已结束 1' }));
  expect(screen.getByRole('button', { name: /#9000/ })).toBeTruthy();
});
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
    expect(screen.queryByRole('button', { name: '查看全部记录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清除筛选' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选并查看全部' }));
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

it('uses keyboard tabs to filter issues and labels the visible panel', () => {
  const open = issueFromGitHub(record, user.id, repo, user.login);
  const closed = issueFromGitHub(
    { ...record, number: 10, title: 'Closed issue', state: 'CLOSED' },
    user.id,
    repo,
    user.login,
  );
  render(
    <ActivityPage
      view="issues"
      items={[open, closed]}
      repo={repo}
      read={[]}
      onRead={vi.fn()}
      onSnooze={vi.fn()}
      onOpen={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: /Closed issue/ })).toBeNull();
  fireEvent.keyDown(screen.getByRole('tab', { name: /开放/ }), { key: 'ArrowRight' });
  const closedTab = screen.getByRole('tab', { name: /已关闭/ });
  expect(document.activeElement).toBe(closedTab);
  expect(closedTab.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('button', { name: /Closed issue/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /#1042/ })).toBeNull();
  expect(screen.getByRole('tabpanel', { name: /已关闭/ }).id).toBe(
    closedTab.getAttribute('aria-controls'),
  );
  fireEvent.keyDown(closedTab, { key: 'Home' });
  expect(screen.getByRole('tab', { name: '全部' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('button', { name: /#1042/ })).toBeTruthy();
});

it('marks all loaded unread inbox entries even while search hides them', () => {
  const items = demoActivities.inbox;
  const onReadAll = vi.fn();
  render(
    <ActivityPage
      view="inbox"
      items={items}
      repo={repo}
      read={[items[0].id]}
      snoozed={[items[1].id]}
      onRead={vi.fn()}
      onReadAll={onReadAll}
      onSnooze={vi.fn()}
      onOpen={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
    target: { value: 'no matching record' },
  });
  fireEvent.click(screen.getByRole('button', { name: '全部标为已读' }));
  expect(onReadAll).toHaveBeenCalledWith(items.slice(2).map((item) => item.id));
});

it('omits comment previews in review rows while preserving inbox updates', () => {
  const record = {
    ...demoActivities.review[0],
    pullStatus: describePull({ state: 'OPEN' }),
    summary: 'Action summary',
    detail: 'Welcome bot message',
  };
  const props = { record, onOpen: vi.fn() };
  const { rerender } = render(<ActivityRecord {...props} />);
  expect(screen.queryByText('Welcome bot message')).toBeNull();
  expect(screen.queryByText('Action summary')).toBeNull();
  rerender(<ActivityRecord {...props} showKind />);
  expect(screen.getByText('Welcome bot message')).toBeTruthy();
});
