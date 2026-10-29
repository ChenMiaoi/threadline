import { describe, expect, it } from 'vitest';
import { describeChecks } from './checks';
describe('check result presentation', () => {
  it('puts failures before running, skipped and successful checks, with separate totals', () => {
    const result = describeChecks(
      [
        { id: 1, name: 'Passed', status: 'completed', conclusion: 'success' },
        { id: 2, name: 'Skipped', status: 'completed', conclusion: 'skipped' },
        { id: 3, name: 'Running', status: 'in_progress', conclusion: null },
        { id: 4, name: 'Failed', status: 'completed', conclusion: 'timed_out' },
      ],
      [{ context: 'External', state: 'error' }],
    );
    expect(result.rows.map((row) => row.name)).toEqual([
      'Failed',
      'External',
      'Running',
      'Skipped',
      'Passed',
    ]);
    expect(result.counts).toEqual({ failed: 2, pending: 1, other: 1, passed: 1 });
    expect(result.rows[1].label).toBe('出错');
  });
  it('does not present missing or unknown conclusions as passing', () => {
    const result = describeChecks(
      [{ id: 1, name: 'Incomplete', status: 'completed', conclusion: null }],
      [{ context: 'New state', state: 'unknown' }],
    );
    expect(result.counts).toEqual({ failed: 0, pending: 0, other: 2, passed: 0 });
    expect(result.rows[1].label).toContain('未知');
  });
});
