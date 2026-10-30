// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IssuePreview } from './IssuePreview';
import { createResourceCache } from '../../lib/useGitHubResource';
import { createGateway, record, repo, response, user } from '../../test/github.fixture';
import { issueFromGitHub } from '../../core/github';

afterEach(cleanup);

it('shows referenced PRs with their state and opens the selected PR', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  const gateway = createGateway();
  gateway.request = vi.fn().mockResolvedValue(
    response({
      issue: { body: 'See #12', user },
      comments: [],
      referencedPulls: [
        {
          number: 12,
          title: 'Fix the issue',
          url: `https://github.com/${repo}/pull/12`,
          state: 'closed',
          merged: true,
        },
      ],
    }),
  );
  render(
    <IssuePreview
      record={issueFromGitHub(record, user.id, repo, user.login)}
      cache={createResourceCache()}
      repo={repo}
      accountId={user.id}
      gateway={gateway}
      onClose={vi.fn()}
      onRead={vi.fn()}
      isRead={false}
      onSnooze={vi.fn()}
    />,
  );
  const link = await screen.findByRole('button', { name: '#12 Fix the issue ↗' });
  expect(screen.getByText(/已合并/)).toBeTruthy();
  expect(screen.getByText(/引用不一定表示合并后会自动关闭 Issue/)).toBeTruthy();
  fireEvent.click(link);
  expect(gateway.open).toHaveBeenCalledWith(`https://github.com/${repo}/pull/12`);
});

it.each([[], undefined])(
  'hides the related PR section when references are %s',
  async (referencedPulls) => {
    const gateway = createGateway();
    gateway.request = vi.fn().mockResolvedValue(
      response({
        issue: { body: 'Issue without related pulls', user },
        comments: [],
        referencedPulls,
      }),
    );
    render(
      <IssuePreview
        record={issueFromGitHub(record, user.id, repo, user.login)}
        cache={createResourceCache()}
        repo={repo}
        accountId={user.id}
        gateway={gateway}
        onClose={vi.fn()}
        onRead={vi.fn()}
        isRead={false}
        onSnooze={vi.fn()}
      />,
    );
    await screen.findByText('Issue without related pulls');
    expect(screen.queryByRole('region', { name: '关联 PR' })).toBeNull();
    expect(screen.queryByText('未找到引用此 Issue 的 PR。')).toBeNull();
    expect(screen.queryByRole('button', { name: '读取关联 PR' })).toBeNull();
  },
);
