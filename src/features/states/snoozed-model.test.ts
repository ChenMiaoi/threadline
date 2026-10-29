import { describe, expect, it } from 'vitest';
import { demoActivities } from '../../test/activities.fixture';
import { snoozeActivityIndex } from './snoozed-model';

describe('snoozed activity index', () => {
  it('keeps the first current record and adds saved-only records without mutating inputs', () => {
    const first = demoActivities.inbox[0];
    const duplicate = { ...first, title: 'Later duplicate' };
    const fallback = { ...demoActivities.inbox[1], id: 'saved-only' };
    const records = Object.freeze([first, duplicate]);
    const saved = Object.freeze({ [first.id]: duplicate, [fallback.id]: fallback });
    const index = snoozeActivityIndex(records, saved);
    expect(index.get(first.id)).toBe(first);
    expect(index.get(fallback.id)).toBe(fallback);
    expect(index.has('missing')).toBe(false);
    expect(index.size).toBe(2);
    expect(records).toEqual([first, duplicate]);
    expect(saved[first.id]).toBe(duplicate);
  });
});
