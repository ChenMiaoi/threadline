import { describe, expect, it } from 'vitest';
import { demoPulls } from '../../test/pulls.fixture';
import { filterPullRequests, groupPullRequests, pullStateCounts } from './model';

describe('pull request views', () => {
  it('counts every state independently of search and keeps stable rows in tied groups', () => {
    const pulls = [
      { ...demoPulls[0], state: 'closed' as const, group: 'Other' },
      { ...demoPulls[1], state: 'merged' as const, group: 'Another' },
      { ...demoPulls[2], state: 'open' as const, group: 'Other' },
      { ...demoPulls[3], state: 'open' as const, group: '需要我的处理' },
    ];
    expect(pullStateCounts(pulls)).toEqual({ open: 2, merged: 1, closed: 1 });
    expect(pullStateCounts([])).toEqual({ open: 0, merged: 0, closed: 0 });
    expect(groupPullRequests(pulls)).toEqual([
      ['需要我的处理', [pulls[3]]],
      ['Other', [pulls[0], pulls[2]]],
      ['Another', [pulls[1]]],
    ]);
    expect(filterPullRequests(pulls, 'open', ' # ')).toEqual([pulls[2], pulls[3]]);
    expect(pulls[0].state).toBe('closed');
  });
  it('keeps actionable groups ahead of more recent waiting and draft groups', () => {
    const reversed = [...demoPulls].reverse();
    expect(groupPullRequests(reversed).map(([group]) => group)).toEqual([
      '需要我的处理',
      '等待评审',
      '草稿',
    ]);
    expect(reversed[0]).toBe(demoPulls.at(-1));
  });
  it('searches numbers, titles, and status without changing the source', () => {
    expect(filterPullRequests(demoPulls, 'open', ' #1042 ').map((p) => p.number)).toEqual([1042]);
    expect(filterPullRequests(demoPulls, 'open', 'LEADING')).toHaveLength(2);
    expect(filterPullRequests(demoPulls, 'open', '新回复').map((p) => p.number)).toEqual([1031]);
    expect(demoPulls).toHaveLength(6);
  });
  it('combines state and attention filters and handles empty results', () => {
    expect(filterPullRequests(demoPulls, 'open', '', true)).toHaveLength(2);
    expect(filterPullRequests(demoPulls, 'closed', '')).toEqual([]);
    expect(filterPullRequests(demoPulls, 'open', 'missing')).toEqual([]);
  });
  it('keeps group and row order after filtering', () => {
    expect(groupPullRequests(demoPulls).map(([name, rows]) => [name, rows.length])).toEqual([
      ['需要我的处理', 2],
      ['等待评审', 3],
      ['草稿', 1],
    ]);
    expect(groupPullRequests([])).toEqual([]);
  });
});
