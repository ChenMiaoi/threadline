import { describe, expect, it } from 'vitest';
import { demoActivities } from '../../test/activities.fixture';
import { activityCounts, filterActivities, groupActivities } from './model';

describe('activity filters', () => {
  it('counts overlapping filters while excluding snoozes and accepts prebuilt membership sets', () => {
    const records = [
      {
        ...demoActivities.inbox[0],
        id: 'one',
        kind: 'pull' as const,
        state: 'open' as const,
        category: 'requested',
        mentioned: true,
      },
      {
        ...demoActivities.inbox[0],
        id: 'two',
        kind: 'issue' as const,
        state: 'closed' as const,
        category: 'authored',
        mentioned: true,
      },
      {
        ...demoActivities.inbox[0],
        id: 'three',
        kind: 'issue' as const,
        state: 'open' as const,
        category: 'participated',
      },
    ];
    const filters = [
      'all',
      'unread',
      'pull',
      'issue',
      'mentions',
      'open',
      'closed',
      'requested',
      'authored',
      'participated',
      'missing',
    ];
    const read = new Set(['one', 'one']);
    const snoozed = new Set(['two']);
    expect(activityCounts(records, filters, read, snoozed)).toEqual({
      all: 2,
      unread: 1,
      pull: 1,
      issue: 1,
      mentions: 1,
      open: 2,
      closed: 0,
      requested: 1,
      authored: 0,
      participated: 1,
      missing: 0,
    });
    for (const filter of filters)
      expect(filterActivities(records, filter, ' ', read, snoozed)).toEqual(
        filterActivities(records, filter, '', [...read], [...snoozed]),
      );
    expect(filterActivities(records, 'unread', '', read, snoozed).map(({ id }) => id)).toEqual([
      'three',
    ]);
  });
  it('keeps review updates ahead of discussion-only groups without reordering their rows', () => {
    const records = [...demoActivities.review].reverse();
    const grouped = groupActivities(records);
    expect(grouped[0][1].every((record) => record.category === 'updated')).toBe(true);
    expect(grouped.at(-1)?.[1].every((record) => record.category === 'discussion')).toBe(true);
    expect(grouped[0][1]).toEqual(records.filter((record) => record.category === 'updated'));
  });
  it('keeps read items in all but removes them from unread', () => {
    expect(filterActivities(demoActivities.inbox, 'unread', '', ['inbox-1042'])).toHaveLength(3);
    expect(filterActivities(demoActivities.inbox, 'all', '', ['inbox-1042'])).toHaveLength(4);
  });
  it('excludes snoozed items and combines mentions with case-insensitive search', () => {
    expect(filterActivities(demoActivities.inbox, 'all', '', [], ['inbox-1042'])).toHaveLength(3);
    expect(filterActivities(demoActivities.inbox, 'mentions', 'DIAGNOSTICS', [])).toHaveLength(1);
    expect(filterActivities(demoActivities.inbox, 'mentions', 'not found', [])).toEqual([]);
  });
  it('keeps review categories distinct from comments and issue participation', () => {
    expect(filterActivities(demoActivities.review, 'updated', '', [])).toHaveLength(2);
    expect(filterActivities(demoActivities.review, 'waiting', '', [])).toHaveLength(1);
    expect(filterActivities(demoActivities.issues, 'authored', 'bug', [])).toHaveLength(1);
    expect(groupActivities(demoActivities.review).map(([group]) => group)).toEqual([
      '评审后有更新',
      '等待作者',
      '仅参与讨论',
    ]);
  });
});
