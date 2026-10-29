import { describe, expect, it } from 'vitest';
import { demoActivities } from '../../test/activities.fixture';
import { filterActivities, groupActivities } from './model';

describe('activity filters', () => {
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
