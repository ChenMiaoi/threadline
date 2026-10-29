import { describe, expect, it } from 'vitest';
import { demoPulls } from './demo';
import { filterPullRequests, groupPullRequests } from './model';

describe('pull request views', () => {
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
