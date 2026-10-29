// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PullDetailPage } from './PullDetailPage';
import { createResourceCache } from '../../lib/useGitHubResource';
import { createGateway, detail, record, repo, response, user } from '../../test/github.fixture';
import { pullFromGitHub } from '../../core/github';
afterEach(cleanup);
it('shows the overview while discussion is pending and requests files/checks only when selected', async () => {
  const gateway = createGateway();
  const request = gateway.request;
  gateway.request = vi
    .fn()
    .mockImplementation((operation, ...args) =>
      operation === 'discussion'
        ? new Promise(() => {})
        : request(operation, ...(args as [string, number, number, string])),
    );
  render(
    <PullDetailPage
      pull={pullFromGitHub(record, user.id, repo)}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={createResourceCache()}
    />,
  );
  await screen.findByRole('heading', { name: '说明' });
  await waitFor(() =>
    expect(vi.mocked(gateway.request).mock.calls.map(([op]) => op)).toEqual(['pull', 'discussion']),
  );
  fireEvent.click(screen.getByRole('tab', { name: '文件变更 1' }));
  await screen.findByText('src/main.ts');
  expect(screen.queryByText(/@@ -1/)).toBeNull();
  const disclosure = screen.getByText('src/main.ts').closest('details')!;
  disclosure.open = true;
  fireEvent(disclosure, new Event('toggle'));
  await screen.findByText(/@@ -1/);
  fireEvent.click(screen.getByRole('tab', { name: '检查' }));
  await screen.findByText('当前 HEAD 没有检查记录。');
  expect(vi.mocked(gateway.request).mock.calls.filter(([op]) => op === 'files')[0]?.[4]).toBe(
    detail.pull.head.sha,
  );
});
it('limits initial discussion rendering while preserving access to earlier entries', async () => {
  const gateway = createGateway();
  const request = gateway.request;
  gateway.request = vi.fn().mockImplementation((operation, ...args) =>
    operation === 'discussion'
      ? Promise.resolve(
          response({
            ...detail,
            comments: [
              Array.from({ length: 40 }, (_, index) => ({
                id: index,
                body: `Comment ${index}`,
                user: { login: `author-${index}` },
                created_at: `2026-10-29T04:${String(index).padStart(2, '0')}:00Z`,
              })),
            ],
          }),
        )
      : request(operation, ...(args as [string, number, number, string])),
  );
  render(
    <PullDetailPage
      pull={pullFromGitHub(record, user.id, repo)}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={createResourceCache()}
    />,
  );
  await screen.findByRole('heading', { name: '讨论 40' });
  expect(screen.queryByRole('heading', { name: 'author-0' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '显示更早的讨论（还有 10 条）' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'author-0' })).toBeTruthy());
});

it('browses detail tabs with arrows without loading a section until activation', async () => {
  const gateway = createGateway();
  render(
    <PullDetailPage
      pull={pullFromGitHub(record, user.id, repo)}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={createResourceCache()}
    />,
  );
  const discussion = screen.getByRole('tab', { name: '讨论' });
  const panelId = screen.getByRole('tabpanel').id;
  expect(discussion.getAttribute('aria-controls')).toBe(panelId);
  await screen.findByRole('heading', { name: '讨论 1' });
  fireEvent.keyDown(discussion, { key: 'ArrowRight' });
  const files = screen.getByRole('tab', { name: '文件变更 1' });
  expect(document.activeElement).toBe(files);
  expect(files.tabIndex).toBe(0);
  expect(discussion.getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(files, { key: 'End' });
  const checks = screen.getByRole('tab', { name: '检查' });
  expect(document.activeElement).toBe(checks);
  expect(vi.mocked(gateway.request).mock.calls.map(([operation]) => operation)).toEqual([
    'pull',
    'discussion',
  ]);
  fireEvent.click(checks);
  await screen.findByText('当前 HEAD 没有检查记录。');
  expect(screen.getByRole('tabpanel', { name: '检查' }).id).toBe(panelId);
  expect(vi.mocked(gateway.request).mock.calls.map(([operation]) => operation)).toEqual([
    'pull',
    'discussion',
    'checks',
  ]);
  fireEvent.keyDown(checks, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(discussion);
  expect(checks.getAttribute('aria-selected')).toBe('true');
});

it('opens cached discussion before a stale cached overview finishes its background refresh', async () => {
  const gateway = createGateway();
  const original = gateway.request;
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof original>) => ({
    ...(await original(...args)),
    fetchedAt: Date.now() - (args[0] === 'pull' ? 121_000 : 0),
  }));
  gateway.request = vi.fn().mockImplementation(() => new Promise(() => {}));
  const cache = createResourceCache();
  render(
    <PullDetailPage
      pull={pullFromGitHub(record, user.id, repo)}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={cache}
    />,
  );
  await screen.findByText('Please add coverage');
  expect(gateway.cached).toHaveBeenCalledWith(
    'discussion',
    repo,
    user.id,
    record.number,
    detail.pull.head.sha,
  );
  expect(gateway.request).toHaveBeenCalledTimes(1);
  expect(cache.samples.some((sample) => sample.source === 'disk' && sample.uiCommitMs < 1000)).toBe(
    true,
  );
});

it('blocks children for a newly known HEAD until live overview validates an even newer HEAD', async () => {
  const gateway = createGateway();
  const original = gateway.request;
  const headB = 'b'.repeat(40);
  const headC = 'c'.repeat(40);
  const firstPull = pullFromGitHub(record, user.id, repo);
  let finish!: (value: unknown) => void;
  const cache = createResourceCache();
  gateway.request = vi.fn().mockImplementation(async (...args: Parameters<typeof original>) => ({
    ...(await original(...args)),
    fetchedAt: Date.now(),
  }));
  const view = render(
    <PullDetailPage
      pull={firstPull}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={cache}
    />,
  );
  await screen.findByText('Please add coverage');
  gateway.request = vi.fn().mockImplementation((operation, ...args) =>
    operation === 'pull'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : original(operation, ...(args as [string, number, number, string])),
  );
  gateway.cached = vi.fn().mockImplementation(() => new Promise(() => {}));
  view.rerender(
    <PullDetailPage
      pull={{ ...firstPull, headSha: headB }}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={cache}
    />,
  );
  await waitFor(() => expect(gateway.request).toHaveBeenCalledTimes(1));
  expect(gateway.cached).not.toHaveBeenCalled();
  expect(screen.queryByText('Please add coverage')).toBeNull();
  gateway.cached = vi.fn().mockResolvedValue(null);
  await act(async () =>
    finish({
      ...response({ pull: { ...detail.pull, head: { ...detail.pull.head, sha: headC } } }),
      fetchedAt: Date.now(),
    }),
  );
  await waitFor(() =>
    expect(gateway.request).toHaveBeenCalledWith('discussion', repo, user.id, record.number, headC),
  );
});

it('omits empty comment reviews but retains decisions and their code freshness', async () => {
  const gateway = createGateway();
  const request = gateway.request;
  gateway.request = vi.fn().mockImplementation((operation, ...args) =>
    operation === 'discussion'
      ? Promise.resolve(
          response({
            comments: [],
            reviewComments: [],
            reviews: [
              [
                {
                  id: 1,
                  user: { login: 'empty-reviewer' },
                  state: 'COMMENTED',
                  body: ' ',
                  submitted_at: '2026-10-20T00:00:00Z',
                  commit_id: 'old',
                },
                {
                  id: 2,
                  user: { login: 'approver' },
                  state: 'APPROVED',
                  body: '',
                  submitted_at: '2026-10-21T00:00:00Z',
                  commit_id: detail.pull.head.sha,
                },
                {
                  id: 3,
                  user: { login: 'requester' },
                  state: 'CHANGES_REQUESTED',
                  body: 'Please fix this',
                  submitted_at: '2026-10-22T00:00:00Z',
                  commit_id: 'old',
                },
              ],
            ],
          }),
        )
      : request(operation, ...(args as [string, number, number, string])),
  );
  render(
    <PullDetailPage
      pull={pullFromGitHub(record, user.id, repo)}
      onBack={vi.fn()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      cache={createResourceCache()}
    />,
  );
  await screen.findByRole('heading', { name: '讨论 2' });
  expect(screen.queryByText('empty-reviewer')).toBeNull();
  expect(screen.queryByText('无正文')).toBeNull();
  expect(screen.getByText('针对当前代码提交的评审')).toBeTruthy();
  expect(screen.getByText(/评审后代码已有更新，此结论针对旧版本/)).toBeTruthy();
  expect(screen.getByText(/批准不代表检查已通过或可以合并/)).toBeTruthy();
});
