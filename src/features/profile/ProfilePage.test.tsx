vi.mock('../../lib/avatar-cache', async (original) => ({
  ...(await original<typeof import('../../lib/avatar-cache')>()),
  loadGitHubAvatar: vi.fn(async () => null),
}));
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';
import { GitHubAvatar } from '../../components/GitHubAvatar';
import { createResourceCache } from '../../lib/useGitHubResource';
import { createGateway, response, user, repo } from '../../test/github.fixture';
import type { GitHubProfile } from './model';

afterEach(cleanup);
const profile: GitHubProfile = {
  repository: repo,
  login: user.login,
  name: user.name,
  avatarUrl: 'https://avatars.githubusercontent.com/u/7',
  url: `https://github.com/${user.login}`,
  bio: 'Building useful things',
  createdAt: '2020-01-01',
  contributionsCollection: {
    contributionYears: [2026, 2025],
    totalCommitContributions: 10,
    totalIssueContributions: 3,
    totalPullRequestContributions: 4,
    totalPullRequestReviewContributions: 5,
    contributionCalendar: {
      totalContributions: 24,
      weeks: [
        {
          contributionDays: [
            {
              date: '2026-01-01',
              weekday: 4,
              contributionCount: 3,
              contributionLevel: 'SECOND_QUARTILE',
            },
            { date: '2026-01-02', weekday: 5, contributionCount: 0, contributionLevel: 'NONE' },
          ],
        },
      ],
    },
  },
};
it('reads repository-year contribution shape and supports keyboard day and year selection', async () => {
  const gateway = createGateway();
  gateway.request = vi.fn().mockResolvedValue(response(profile));
  render(
    <ProfilePage
      repo={repo}
      user={user}
      gateway={gateway}
      cache={createResourceCache('account:7')}
    />,
  );
  await screen.findByText(/年共 24 次贡献/);
  expect(gateway.request).toHaveBeenCalledWith(
    'profile',
    repo,
    user.id,
    new Date().getUTCFullYear(),
    '',
  );
  expect(screen.getByText(`当前仓库 · ${repo}`)).toBeTruthy();
  expect(
    (await screen.findByRole('img', { name: `${user.login} 的头像` })).getAttribute('src'),
  ).toBe(profile.avatarUrl);
  const calendar = screen.getByLabelText(/使用方向键选择日期/);
  fireEvent.keyDown(calendar, { key: 'ArrowDown' });
  expect(document.getElementById('contribution-selected-day')?.textContent).toBe(
    '2026-01-02：0 次贡献',
  );
  expect(screen.getAllByRole('listitem').every((day) => day.tabIndex === -1)).toBe(true);
  fireEvent.change(screen.getByRole('combobox', { name: '贡献年份' }), {
    target: { value: '2025' },
  });
  await waitFor(() => expect(gateway.request).toHaveBeenCalledWith('profile', repo, 7, 2025, ''));
});
it('retries a failed request and never publishes a previous account response', async () => {
  const gateway = createGateway();
  let complete!: (value: ReturnType<typeof response<GitHubProfile>>) => void;
  gateway.request = vi
    .fn()
    .mockRejectedValueOnce(new Error('GH_TIMEOUT'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValue(response({ ...profile, name: 'New account' }));
  const { rerender } = render(
    <ProfilePage repo={repo} user={user} gateway={gateway} cache={createResourceCache('7')} />,
  );
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '重试个人主页' }));
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  rerender(
    <ProfilePage
      key="8"
      repo={repo}
      user={{ ...user, id: 8, login: 'new-user', name: 'New account' }}
      gateway={gateway}
      cache={createResourceCache('8')}
    />,
  );
  await screen.findByText('New account');
  await act(async () => {
    complete(response({ ...profile, bio: 'Old account secret' }));
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText('Old account secret')).toBeNull());
});
it('uses initials for untrusted URLs and failed GitHub image loads', async () => {
  const { rerender } = render(
    <GitHubAvatar login="contributor" url="https://avatars.githubusercontent.com.evil.test/u/7" />,
  );
  expect(screen.queryByRole('img')).toBeNull();
  rerender(<GitHubAvatar login="contributor" url="https://avatars.githubusercontent.com/u/7" />);
  fireEvent.error(await screen.findByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('C')).toBeTruthy();
});

it('discards a delayed previous year response after selecting another year', async () => {
  const gateway = createGateway();
  let complete!: (value: ReturnType<typeof response<GitHubProfile>>) => void;
  gateway.request = vi
    .fn()
    .mockResolvedValueOnce(response(profile))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValueOnce(
      response({
        ...profile,
        contributionsCollection: {
          ...profile.contributionsCollection,
          contributionCalendar: {
            ...profile.contributionsCollection.contributionCalendar,
            totalContributions: 99,
          },
        },
      }),
    );
  render(
    <ProfilePage repo={repo} user={user} gateway={gateway} cache={createResourceCache('7')} />,
  );
  await screen.findByText(/年共 24 次贡献/);
  fireEvent.change(screen.getByLabelText('贡献年份'), { target: { value: '2025' } });
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  fireEvent.change(screen.getByLabelText('贡献年份'), {
    target: { value: String(new Date().getUTCFullYear()) },
  });
  await screen.findByText(/年共 99 次贡献/);
  await act(async () => {
    complete(response(profile));
    await Promise.resolve();
  });
  expect(screen.queryByText(/年共 24 次贡献/)).toBeNull();
  expect(screen.getByText(/年共 99 次贡献/)).toBeTruthy();
});

it('isolates delayed responses when switching selected repositories', async () => {
  const gateway = createGateway();
  const cache = createResourceCache('profile-v2:7');
  let complete!: (value: ReturnType<typeof response<GitHubProfile>>) => void;
  gateway.request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValueOnce(
      response({
        ...profile,
        repository: 'owner/other',
        contributionsCollection: {
          ...profile.contributionsCollection,
          totalCommitContributions: 999,
          contributionCalendar: {
            ...profile.contributionsCollection.contributionCalendar,
            totalContributions: 999,
          },
        },
      }),
    );
  const { rerender } = render(
    <ProfilePage repo={repo} user={user} gateway={gateway} cache={cache} />,
  );
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  rerender(<ProfilePage repo="owner/other" user={user} gateway={gateway} cache={cache} />);
  await screen.findByText(/年共 999 次贡献/);
  await act(async () => {
    complete(response(profile));
    await Promise.resolve();
  });
  expect(screen.getByText('当前仓库 · owner/other')).toBeTruthy();
  expect(screen.queryByText(/年共 24 次贡献/)).toBeNull();
  expect(gateway.request).toHaveBeenLastCalledWith(
    'profile',
    'owner/other',
    7,
    new Date().getUTCFullYear(),
    '',
  );
});
