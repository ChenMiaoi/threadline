// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
