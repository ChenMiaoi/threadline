import { describe, expect, it } from 'vitest';
import { activityFromGitHub } from './github';
import { newUpdates, chronological, observeUpdates, quietHours, shouldNotify } from './inbox';
import { defaultWorkspace, normalizeWorkspace } from './workspace';
import { record, repo, user } from '../test/github.fixture';
const activity = activityFromGitHub(record, user.id, repo, user.login);
describe('unified activity inbox', () => {
  it.each(['reviewer', user.login])(
    "keeps the revision, time and read state when fetching history before %s's comment",
    (login) => {
      const comments = {
        totalCount: 2,
        nodes: [
          {
            body: 'Older comment',
            author: { login: 'reviewer' },
            createdAt: '2026-10-28T04:00:00Z',
          },
          { ...record.comments.nodes[0], author: { login } },
        ],
      };
      const before = activityFromGitHub(
        { ...record, comments: { ...comments, nodes: comments.nodes.slice(-1) } },
        user.id,
        repo,
        user.login,
      );
      const after = activityFromGitHub({ ...record, comments }, user.id, repo, user.login);
      expect(after.id).toBe(before.id);
      const observed = observeUpdates([after], [before], Date.parse('2026-10-30T11:48:00Z'))[0];
      expect(observed.updatedAt).toBe(before.updatedAt);
      expect(observed.serverRead).toBe(before.serverRead);
      expect(observed.selfEvent).toBe(before.selfEvent);
      expect(newUpdates([after], [before.id])).toEqual([]);
    },
  );
  it('detects HEAD, check and edited-comment changes without relying on thread timestamps', () => {
    for (const changed of [
      { ...record, headRefOid: 'new-head' },
      { ...record, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } },
      {
        ...record,
        comments: {
          totalCount: 1,
          nodes: [
            { body: 'Edited reply', author: { login: 'reviewer' }, createdAt: record.updatedAt },
          ],
        },
      },
    ]) {
      const next = activityFromGitHub(changed, user.id, repo, user.login);
      expect(next.id).not.toBe(activity.id);
      expect(newUpdates([next], [activity.id])).toEqual([next]);
    }
    expect(newUpdates([activity], undefined)).toEqual([]);
    expect(newUpdates([activity], [activity.id])).toEqual([]);
  });
  it('mixes issues and PRs chronologically and bumps a detected revision only once', () => {
    const issue = {
      ...activity,
      kind: 'issue' as const,
      number: 9,
      id: 'issue',
      updatedAt: '2026-10-29T15:00:00Z',
    };
    expect(chronological([activity, issue])[0]).toBe(issue);
    const observed = observeUpdates(
      [{ ...activity, id: 'changed' }],
      [activity],
      Date.parse('2026-10-29T16:00:00Z'),
    );
    expect(chronological([issue, ...observed])[0].id).toBe('changed');
    expect(
      observeUpdates(
        [{ ...activity, id: 'changed' }],
        observed,
        Date.parse('2026-10-29T17:00:00Z'),
      )[0].updatedAt,
    ).toBe(observed[0].updatedAt);
  });
  it('persists separate baselines for each account and repository', () => {
    const data = normalizeWorkspace(
      { ...defaultWorkspace(), inboxSeen: { [`7:${repo}`]: [activity.id], [`8:${repo}`]: [] } },
      Date.now(),
    );
    expect(newUpdates([activity], data.inboxSeen[`7:${repo}`])).toEqual([]);
    expect(newUpdates([activity], data.inboxSeen[`8:${repo}`])).toEqual([activity]);
    expect(newUpdates([activity], data.inboxSeen['7:owner/other'])).toEqual([]);
  });
  it('silently resets an older feed checkpoint when coverage changes', () => {
    const data = normalizeWorkspace(
      {
        ...defaultWorkspace(),
        inboxVersion: undefined,
        inboxSeen: { [`7:${repo}`]: [activity.id] },
      },
      Date.now(),
    );
    expect(data.inboxSeen).toEqual({});
    expect(newUpdates([activity], data.inboxSeen[`7:${repo}`])).toEqual([]);
    expect(data.inboxVersion).toBe(3);
  });
  it('matches observations by kind and number and preserves the first prior match', () => {
    const issue = {
      ...activity,
      kind: 'issue' as const,
      id: 'issue',
      updatedAt: '2026-10-28T10:00:00Z',
    };
    const duplicate = { ...activity, updatedAt: '2026-10-27T10:00:00Z' };
    const fresh = { ...activity, number: activity.number + 1 };
    const observed = observeUpdates(
      [activity, issue, fresh],
      [activity, duplicate, issue],
      Date.now(),
    );
    expect(observed[0].updatedAt).toBe(activity.updatedAt);
    expect(observed[1].updatedAt).toBe(issue.updatedAt);
    expect(observed[2]).toBe(fresh);
  });
  it('applies quiet hours and reminder choices without filtering the inbox', () => {
    const prefs = defaultWorkspace().preferences;
    expect(quietHours(prefs, new Date(2026, 9, 29, 23))).toBe(true);
    expect(quietHours(prefs, new Date(2026, 9, 29, 8))).toBe(false);
    expect(
      quietHours({ ...prefs, quietStart: '09:00', quietEnd: '17:00' }, new Date(2026, 9, 29, 12)),
    ).toBe(true);
    expect(quietHours({ ...prefs, quietStart: '08:00', quietEnd: '08:00' }, new Date())).toBe(
      false,
    );
    expect(
      shouldNotify({ ...activity, changeType: 'comment' }, { ...prefs, notifyComments: false }),
    ).toBe(false);
    expect(shouldNotify({ ...activity, changeType: 'commit' }, prefs)).toBe(true);
  });
});

it('does not resurface an unchanged thread after my own comment, but keeps concurrent code changes', () => {
  const before = activityFromGitHub(
    { ...record, comments: { totalCount: 0, nodes: [] } },
    user.id,
    repo,
    user.login,
  );
  const ownRecord = {
    ...record,
    updatedAt: '2026-10-30T10:05:00Z',
    comments: {
      totalCount: 1,
      nodes: [
        { body: 'My reply', author: { login: user.login }, createdAt: '2026-10-30T10:05:00Z' },
      ],
    },
  };
  const own = activityFromGitHub(ownRecord, user.id, repo, user.login);
  expect(own.selfEvent).toBe(true);
  expect(shouldNotify(own, defaultWorkspace().preferences)).toBe(false);
  const observed = observeUpdates([own], [before], Date.now())[0];
  expect(observed.id).toBe(before.id);
  expect(newUpdates([observed], [before.id])).toEqual([]);
  const withCommit = activityFromGitHub(
    { ...ownRecord, headRefOid: 'new-commit' },
    user.id,
    repo,
    user.login,
  );
  const changed = observeUpdates([withCommit], [before], Date.now())[0];
  expect(changed.selfEvent).toBe(false);
  expect(changed.serverRead).toBe(false);
  expect(changed.id).not.toBe(before.id);
});

it('keeps external comments received before my reply in the same synchronization unread', () => {
  const before = activityFromGitHub(
    { ...record, comments: { totalCount: 0, nodes: [] } },
    user.id,
    repo,
    user.login,
  );
  const time = '2026-10-30T10:05:00Z';
  const after = activityFromGitHub(
    {
      ...record,
      updatedAt: time,
      comments: {
        totalCount: 2,
        nodes: [
          { body: 'Please update this', author: { login: 'another-reviewer' }, createdAt: time },
          { body: 'My acknowledgement', author: { login: user.login }, createdAt: time },
        ],
      },
    },
    user.id,
    repo,
    user.login,
  );
  const observed = observeUpdates([after], [before], Date.now())[0];
  expect(observed.id).not.toBe(before.id);
  expect(observed.selfEvent).toBe(false);
  expect(observed.serverRead).toBe(false);
  expect(shouldNotify(observed, defaultWorkspace().preferences)).toBe(true);
});
