import { describe, expect, it } from 'vitest';
import { activityFromGitHub } from './github';
import { newUpdates, chronological, observeUpdates, quietHours, shouldNotify } from './inbox';
import { defaultWorkspace, normalizeWorkspace } from './workspace';
import { record, repo, user } from '../test/github.fixture';
const activity = activityFromGitHub(record, user.id, repo, user.login);
describe('unified activity inbox', () => {
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
    expect(data.inboxVersion).toBe(1);
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
