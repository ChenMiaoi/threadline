import { describe, expect, it } from 'vitest';
import {
  activityFromGitHub,
  issueFromGitHub,
  previewText,
  notificationFromGitHub,
  pullFromGitHub,
  recordId,
  reviewFromGitHub,
  searchRecords,
} from './github';
import { notifications, record, repo, user, updated } from '../test/github.fixture';
describe('GitHub records', () => {
  it('isolates read identities by account, repository, and notification revision', () => {
    const original = notificationFromGitHub(notifications[0], user.id).id;
    expect(
      notificationFromGitHub({ ...notifications[0], updated_at: '2026-10-30T00:00:00Z' }, user.id)
        .id,
    ).not.toBe(original);
    expect(notificationFromGitHub(notifications[0], 9).id).not.toBe(original);
    expect(recordId(user.id, 'other/project', 'notification', '1', updated)).not.toBe(original);
  });
  it('maps merged and draft pulls without fabricating checks or reviewers', () => {
    expect(pullFromGitHub({ ...record, state: 'MERGED' }, user.id, repo).state).toBe('merged');
    expect(pullFromGitHub({ ...record, isDraft: true }, user.id, repo).status).toBe('草稿');
    expect(pullFromGitHub(record, user.id, repo).check).toBe('none');
    expect(pullFromGitHub(record, user.id, repo).reviewer).toBe('');
    expect(pullFromGitHub(record, user.id, repo).author).toBe(user.login);
    expect(pullFromGitHub(record, user.id, repo).previewAuthor).toBe('reviewer');
  });
  it('requires re-review when a formal review targets an older commit', () => {
    const reviews = {
      totalCount: 1,
      nodes: [
        {
          state: 'APPROVED',
          body: '',
          submittedAt: updated,
          author: { login: user.login },
          commit: { oid: 'b'.repeat(40) },
        },
      ],
    };
    expect(reviewFromGitHub({ ...record, reviews }, user.id, repo, user.login).category).toBe(
      'updated',
    );
    expect(
      reviewFromGitHub(
        { ...record, reviews, headRefOid: 'b'.repeat(40) },
        user.id,
        repo,
        user.login,
      ).category,
    ).toBe('reviewed');
  });
  it('never treats comments or dismissed reviews as formal approval', () => {
    const review = {
      state: 'APPROVED',
      body: '',
      submittedAt: updated,
      author: { login: user.login },
      commit: { oid: record.headRefOid! },
    };
    const reviews = { totalCount: 2, nodes: [review, { ...review, state: 'DISMISSED' }] };
    expect(reviewFromGitHub({ ...record, reviews }, user.id, repo, user.login).category).toBe(
      'discussion',
    );
    expect(
      reviewFromGitHub(
        { ...record, reviews: { totalCount: 1, nodes: [{ ...review, state: 'COMMENTED' }] } },
        user.id,
        repo,
        user.login,
      ).category,
    ).toBe('discussion');
  });
  it('deduplicates paginated review search results and preserves actual issue state', () => {
    const page = { data: { search: { issueCount: 1, nodes: [record] } } };
    expect(searchRecords([page, page])).toEqual([record]);
    expect(issueFromGitHub({ ...record, state: 'CLOSED' }, user.id, repo, user.login).state).toBe(
      'closed',
    );
  });
});

describe('personal review and lifecycle separation', () => {
  const formal = {
    state: 'CHANGES_REQUESTED',
    body: '',
    submittedAt: updated,
    author: { login: user.login },
    commit: { oid: 'b'.repeat(40) },
  };
  it('retains the personal conclusion when new commits require inspection', () => {
    const result = reviewFromGitHub(
      { ...record, reviews: { totalCount: 1, nodes: [formal] } },
      user.id,
      repo,
      user.login,
    );
    expect(result.category).toBe('updated');
    expect(result.personalReview?.label).toBe('要求变更 · 旧版本');
    expect(result.pullStatus?.lifecycle.label).toBe('开放');
    expect(result.summary).toContain('查看新提交');
  });
  it('keeps merged/closed PRs out of re-review and author-waiting filters', () => {
    for (const state of ['MERGED', 'CLOSED']) {
      const result = reviewFromGitHub(
        { ...record, state, reviews: { totalCount: 1, nodes: [formal] } },
        user.id,
        repo,
        user.login,
      );
      expect(result.category).toBe('finished');
      expect(result.needsAttention).toBe(false);
      expect(result.summary).toContain('流程已结束');
      expect(result.state).toBe(state.toLowerCase());
    }
  });
  it('distinguishes a new request, a draft, and a missing version from a known code update', () => {
    const requested = {
      ...record,
      reviewRequests: { nodes: [{ requestedReviewer: { login: user.login } }] },
    };
    expect(reviewFromGitHub(requested, user.id, repo, user.login).category).toBe('requested');
    expect(
      reviewFromGitHub({ ...requested, isDraft: true }, user.id, repo, user.login).category,
    ).toBe('draft');
    expect(
      reviewFromGitHub(
        { ...record, headRefOid: undefined, reviews: { totalCount: 1, nodes: [formal] } },
        user.id,
        repo,
        user.login,
      ).category,
    ).toBe('unverified');
  });
  it('treats truncated personal history as unknown and chooses the latest formal conclusion by date', () => {
    const unknown = reviewFromGitHub(
      { ...record, reviews: { totalCount: 101, nodes: [] } },
      user.id,
      repo,
      user.login,
    );
    expect(unknown.personalReview?.label).toBe('历史不完整');
    const result = reviewFromGitHub(
      {
        ...record,
        reviews: {
          totalCount: 2,
          nodes: [{ ...formal, state: 'DISMISSED', submittedAt: '2026-10-30T00:00:00Z' }, formal],
        },
      },
      user.id,
      repo,
      user.login,
    );
    expect(result.personalReview?.label).toBe('已撤销');
    expect(result.summary).toContain('已撤销');
  });
});

it('shows only active review requests instead of substituting the most recent reviewer', () => {
  const previous = {
    ...record,
    reviews: {
      totalCount: 1,
      nodes: [
        {
          state: 'APPROVED',
          body: '',
          submittedAt: updated,
          author: { login: 'past-reviewer' },
          commit: { oid: record.headRefOid! },
        },
      ],
    },
  };
  expect(pullFromGitHub(previous, user.id, repo).reviewer).toBe('');
  const requested = {
    ...previous,
    reviewRequests: { nodes: [{ requestedReviewer: { login: 'requested-reviewer' } }] },
  };
  expect(pullFromGitHub(requested, user.id, repo).reviewer).toBe('requested-reviewer');
  expect(pullFromGitHub({ ...requested, state: 'MERGED' }, user.id, repo).reviewer).toBe('');
});

describe('list summaries', () => {
  it('cleans Markdown without corrupting code identifiers or mutating source content', () => {
    const body =
      '> **Fix** `__builtin_addressof` with [coverage](https://example.test)\n\n```c\nint x;\n```';
    expect(previewText(body)).toBe('Fix __builtin_addressof with coverage [代码片段]');
    expect(previewText('__builtin_x and __builtin_y')).toBe('__builtin_x and __builtin_y');
    expect(body).toContain('```c');
  });
});

it('shows readable review activity without presenting historical review requirements on merged PRs', () => {
  const activity = activityFromGitHub(
    {
      ...record,
      state: 'MERGED',
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: {
        totalCount: 1,
        nodes: [
          {
            state: 'COMMENTED',
            body: '',
            submittedAt: '2026-10-30T12:00:00Z',
            author: { login: 'reviewer' },
            commit: null,
          },
        ],
      },
    },
    user.id,
    repo,
    user.login,
  );
  expect(activity.summary).toBe('reviewer · 评审评论');
  expect(activity.detail).toBe('PR · 已合并');
});

describe('collaboration revision identity', () => {
  it('keeps merge-condition recalculation out of revisions while updating its presentation', () => {
    const snapshot = { ...record, reviewDecision: 'APPROVED' };
    const statuses = ['CLEAN', 'UNKNOWN', 'CLEAN', 'BLOCKED', 'BEHIND'];
    const activities = statuses.map((mergeStateStatus) =>
      activityFromGitHub({ ...snapshot, mergeStateStatus }, user.id, repo, user.login),
    );
    expect(new Set(activities.map((activity) => activity.id)).size).toBe(1);
    expect(activities.map((activity) => activity.pullStatus?.merge.label)).toEqual([
      '条件满足',
      '待确认',
      '条件满足',
      '规则阻塞',
      '分支落后',
    ]);
    expect(activities[0].pullStatus?.nextAction).not.toBe(activities[1].pullStatus?.nextAction);
    expect(activities[3].pullStatus?.nextAction).not.toBe(activities[4].pullStatus?.nextAction);
  });

  it.each([
    ['title', { title: 'Updated title' }],
    ['body', { body: 'Updated description' }],
    ['lifecycle', { state: 'CLOSED' }],
    ['draft', { isDraft: true }],
    ['HEAD', { headRefOid: 'b'.repeat(40) }],
    ['review decision', { reviewDecision: 'APPROVED' }],
    [
      'review request',
      { reviewRequests: { nodes: [{ requestedReviewer: { login: 'reviewer' } }] } },
    ],
    ['checks', { commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] } }],
    [
      'formal review',
      {
        reviews: {
          totalCount: 1,
          nodes: [
            {
              state: 'APPROVED',
              body: '',
              submittedAt: updated,
              author: { login: 'reviewer' },
              commit: { oid: record.headRefOid! },
            },
          ],
        },
      },
    ],
    [
      'edited comment',
      {
        comments: {
          ...record.comments,
          nodes: [{ ...record.comments.nodes[0], body: 'Updated comment' }],
        },
      },
    ],
  ])('still detects %s changes without a newer thread timestamp', (_field, change) => {
    const original = activityFromGitHub(record, user.id, repo, user.login);
    const changed = activityFromGitHub({ ...record, ...change }, user.id, repo, user.login);
    expect(changed.id).not.toBe(original.id);
    expect(changed.updatedAt).toBe(original.updatedAt);
  });
});
