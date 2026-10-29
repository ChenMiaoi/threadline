import { describe, expect, it } from 'vitest';
import {
  issueFromGitHub,
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
