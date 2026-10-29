import { describe, expect, it } from 'vitest';
import { defaultWorkspace, nextMorning, normalizeWorkspace, releaseDue } from './workspace';

const now = new Date(2026, 9, 29, 15).getTime();
describe('local workspace data', () => {
  it('validates persisted preferences without accepting unsupported values', () => {
    const data = normalizeWorkspace(
      {
        preferences: {
          theme: 'light',
          density: 'invalid',
          quietStart: '25:00',
          notifyAttention: false,
        },
        read: ['inbox-1042', 'inbox-1042', 5, 'unknown'],
      },
      now,
    );
    expect(data.preferences.theme).toBe('light');
    expect(data.preferences.density).toBe('comfortable');
    expect(data.preferences.quietStart).toBe('22:00');
    expect(data.preferences.notifyAttention).toBe(false);
    expect(data.read).toEqual(['inbox-1042']);
    expect(() => normalizeWorkspace([], now)).toThrow();
    expect(() => normalizeWorkspace({ version: 2 }, now)).toThrow();
  });
  it('restores due snoozes exactly once without modifying the input', () => {
    const data = {
      ...defaultWorkspace(now),
      read: ['inbox-1042', 'inbox-1031'],
      snoozed: { 'inbox-1042': now - 1, 'inbox-1031': now + 60000 },
    };
    const restored = releaseDue(data, now);
    expect(restored.snoozed).toEqual({ 'inbox-1031': now + 60000 });
    expect(restored.read).toEqual(['inbox-1031']);
    expect(restored.restored).toEqual(['inbox-1042']);
    expect(releaseDue(restored, now)).toBe(restored);
    expect(Object.keys(data.snoozed)).toHaveLength(2);
  });
  it('uses local mornings and never schedules in the past', () => {
    expect(new Date(nextMorning(now)).getHours()).toBe(9);
    expect(new Date(nextMorning(now, true)).getDay()).toBe(1);
    expect(nextMorning(now, true)).toBeGreaterThan(now);
  });
  it('preserves an intentionally empty snooze list and discards invalid deadlines', () => {
    expect(normalizeWorkspace({ snoozed: {} }, now).snoozed).toEqual({});
    expect(
      normalizeWorkspace({ snoozed: { 'inbox-1': Infinity, 'inbox-2': 'tomorrow' } }, now).snoozed,
    ).toEqual({});
  });
});
