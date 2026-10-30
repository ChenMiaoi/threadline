import { describe, expect, it } from 'vitest';
import {
  defaultWorkspace,
  markRecordsRead,
  inboxReadIds,
  MAX_INBOX_REVISIONS,
  nextMorning,
  normalizeWorkspace,
  releaseDue,
  workspaceInbox,
} from './workspace';
import { notificationFromGitHub } from './github';
import { notifications, user, repo } from '../test/github.fixture';

const now = new Date(2026, 9, 29, 15).getTime();
describe('local workspace data', () => {
  it('starts without synthetic snoozes and persists real account-scoped records', () => {
    expect(defaultWorkspace().snoozed).toEqual({});
    const record = notificationFromGitHub(notifications[0], user.id);
    const original = {
      ...defaultWorkspace(),
      snoozed: { [record.id]: now - 1 },
      snoozeRecords: { [record.id]: record },
      read: [record.id],
    };
    const data = normalizeWorkspace(JSON.parse(JSON.stringify(original)), now);
    expect(data.read).toEqual([]);
    expect(workspaceInbox([], data, `github:${user.id}:${repo}:`)).toEqual([record]);
    expect(workspaceInbox([], data, `github:999:${repo}:`)).toEqual([]);
    expect(workspaceInbox([record], data, `github:${user.id}:${repo}:`)).toHaveLength(1);
    expect(data.unread).toContain(record.id);
  });
  it('merges local and server read markers while respecting explicit unread overrides', () => {
    const record = notificationFromGitHub(notifications[0], user.id);
    const records = [
      { ...record, id: 'local', serverRead: false },
      { ...record, id: 'server', serverRead: true },
      { ...record, id: 'override', serverRead: true },
      { ...record, id: 'both', serverRead: true },
      { ...record, id: 'unknown', serverRead: false },
    ];
    expect([...inboxReadIds(records, ['local', 'both', 'both'], ['override', 'both'])]).toEqual([
      'local',
      'both',
      'server',
    ]);
  });
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
  it('restores all supported inbox revisions without accepting truncated or oversized baselines', () => {
    const revisions = Array.from({ length: MAX_INBOX_REVISIONS }, (_, index) => `inbox-${index}`);
    const data = { ...defaultWorkspace(), inboxSeen: { [`7:${repo}`]: revisions } };
    expect(
      normalizeWorkspace(JSON.parse(JSON.stringify(data)), now).inboxSeen[`7:${repo}`],
    ).toEqual(revisions);
    expect(normalizeWorkspace({ ...data, inboxVersion: 1 }, now).inboxSeen).toEqual({});
    expect(
      normalizeWorkspace(
        { ...data, inboxSeen: { [`7:${repo}`]: [...revisions, 'inbox-9999'] } },
        now,
      ).inboxSeen,
    ).toEqual({});
  });
  it('restores due snoozes exactly once without modifying the input', () => {
    const data = {
      ...defaultWorkspace(),
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

it('resets only the revision checkpoint when migrating a version 2 inbox', () => {
  const record = notificationFromGitHub(notifications[0], user.id);
  const original = {
    ...defaultWorkspace(),
    inboxVersion: 2,
    inboxSeen: { [`${user.id}:${repo}`]: [record.id] },
    preferences: { ...defaultWorkspace().preferences, theme: 'light', refreshMinutes: 15 },
    read: [record.id],
    unread: ['inbox-1031'],
    snoozed: { [record.id]: now + 60000 },
    snoozeRecords: { [record.id]: record },
    restored: ['inbox-1027'],
  };
  const migrated = normalizeWorkspace(original, now);
  expect(migrated).toEqual({ ...original, inboxVersion: 3, inboxSeen: {} });
  expect(original.inboxSeen[`${user.id}:${repo}`]).toEqual([record.id]);
});

it('retains bulk read revisions across persistence and clears only targeted overrides', () => {
  const ids = Array.from({ length: 2100 }, (_, i) => `inbox-${i}`);
  const data = { ...defaultWorkspace(), read: ['other'], unread: [ids[0], 'untouched'] };
  const updated = markRecordsRead(data, [...ids, ids[0]]);
  expect(updated.read).toHaveLength(2101);
  expect(updated.unread).toEqual(['untouched']);
  expect(normalizeWorkspace(JSON.parse(JSON.stringify(updated)), now).read).toContain(ids[0]);
});

it('migrates sound preferences quietly and validates persisted effect names', () => {
  expect(
    normalizeWorkspace({ preferences: {} }, Date.now()).preferences.notificationSoundEnabled,
  ).toBe(false);
  const restored = normalizeWorkspace(
    { preferences: { notificationSoundEnabled: true, notificationSound: 'bell' } },
    Date.now(),
  );
  expect(restored.preferences.notificationSoundEnabled).toBe(true);
  expect(restored.preferences.notificationSound).toBe('bell');
  expect(
    normalizeWorkspace({ preferences: { notificationSound: 'outside.wav' } }, Date.now())
      .preferences.notificationSound,
  ).toBe('soft');
});
