import { vi } from 'vitest';
import type {
  GitHubGateway,
  GitHubNotification,
  GitHubResponse,
  PullDetail,
  SearchRecord,
} from '../core/github';
export const user = { id: 7, login: 'contributor', name: 'Contributor' };
export const repo = 'owner/project';
export const updated = '2026-10-29T04:00:00Z';
export const record: SearchRecord = {
  number: 1042,
  title: 'Preserve leading-space flags',
  body: 'A real API-shaped description',
  url: `https://github.com/${repo}/pull/1042`,
  state: 'OPEN',
  updatedAt: updated,
  author: { login: user.login },
  headRefOid: 'a'.repeat(40),
  reviewDecision: 'CHANGES_REQUESTED',
  comments: {
    totalCount: 1,
    nodes: [{ body: 'Please add coverage', author: { login: 'reviewer' }, createdAt: updated }],
  },
  reviews: { totalCount: 0, nodes: [] },
  reviewRequests: { nodes: [] },
  commits: { nodes: [] },
};
export const notifications: GitHubNotification[] = [1042, 1031, 1027, 286].map((number, index) => ({
  id: String(index + 1),
  unread: true,
  reason: index === 0 ? 'mention' : 'comment',
  updated_at: updated,
  subject: {
    title: `Update ${number}`,
    url: `https://api.github.com/repos/${repo}/pulls/${number}`,
    type: 'PullRequest',
  },
  repository: { id: 8, full_name: repo },
}));
export const detail: PullDetail = {
  pull: {
    number: 1042,
    title: record.title,
    body: record.body,
    html_url: record.url,
    state: 'open',
    merged: false,
    draft: false,
    user: { login: user.login },
    head: { sha: 'a'.repeat(40), ref: 'feature' },
    base: { ref: 'main' },
    additions: 3,
    deletions: 1,
    changed_files: 1,
    commits: 2,
  },
  comments: [
    [{ id: 1, body: 'Please add coverage', user: { login: 'reviewer' }, created_at: updated }],
  ],
  reviews: [[]],
  reviewComments: [[]],
  files: [
    [
      {
        filename: 'src/main.ts',
        additions: 3,
        deletions: 1,
        status: 'modified',
        patch: '@@ -1 +1 @@\n-old\n+new',
      },
    ],
  ],
  checks: [{ check_runs: [] }],
  statuses: [{ statuses: [] }],
  checkError: null,
};
export function response<T>(payload: T): GitHubResponse<T> {
  return { payload, fetchedAt: Date.parse(updated), stale: false, error: null };
}
export function createGateway(): GitHubGateway {
  return {
    session: vi.fn().mockResolvedValue({ user, selected: repo, notificationsAvailable: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    login: vi
      .fn()
      .mockResolvedValue({ status: 'starting', code: null, verificationUrl: null, error: null }),
    loginStatus: vi.fn().mockResolvedValue({
      status: 'waiting',
      code: 'ABCD-1234',
      verificationUrl: 'https://github.com/login/device',
      error: null,
    }),
    cancelLogin: vi
      .fn()
      .mockResolvedValue({ status: 'cancelled', code: null, verificationUrl: null, error: null }),
    open: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockImplementation(async (operation) => {
      if (operation === 'repositories')
        return response([
          [
            { id: 8, full_name: repo, private: false, description: null },
            { id: 9, full_name: 'owner/other', private: true, description: null },
          ],
        ]);
      if (operation === 'inbox') return response([notifications]);
      if (
        operation === 'detail' ||
        operation === 'pull' ||
        operation === 'discussion' ||
        operation === 'files' ||
        operation === 'checks'
      )
        return response(detail);
      if (operation === 'issue')
        return response({
          issue: { body: 'Issue body', user: { login: user.login } },
          comments: [[]],
        });
      return response([
        {
          data: {
            search: {
              issueCount: operation === 'authored' ? 2 : 0,
              nodes:
                operation === 'authored'
                  ? [
                      record,
                      { ...record, number: 1031, title: 'Correct source location reporting' },
                    ]
                  : [],
            },
          },
        },
      ]);
    }),
  };
}
