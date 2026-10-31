import { expect, it } from 'vitest';
import {
  calendarDate,
  normalizeTimeZone,
  resolveTimeZone,
  timeZoneLabel,
  timeZoneOptions,
} from './time-zone';
import { defaultWorkspace, normalizeWorkspace } from './workspace';
import { shortTime } from './github';

it('defaults old workspaces and invalid zones to the system zone and persists a valid choice', () => {
  expect(defaultWorkspace().preferences.timeZone).toBe('system');
  for (const value of [undefined, null, {}, '', 'Invalid/Zone']) {
    expect(normalizeTimeZone(value)).toBe('system');
    expect(normalizeWorkspace({ preferences: { timeZone: value } }, 0).preferences.timeZone).toBe(
      'system',
    );
  }
  const saved = {
    ...defaultWorkspace(),
    preferences: { ...defaultWorkspace().preferences, timeZone: 'Asia/Shanghai' },
  };
  expect(normalizeWorkspace(JSON.parse(JSON.stringify(saved)), 0).preferences.timeZone).toBe(
    'Asia/Shanghai',
  );
  expect(resolveTimeZone()).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(timeZoneOptions('Asia/Shanghai')).toEqual(
    expect.arrayContaining(['UTC', 'Asia/Shanghai', 'America/New_York']),
  );
});

it('uses the chosen calendar date across midnight and year boundaries', () => {
  const instant = new Date('2026-12-31T18:30:00Z');
  expect(calendarDate(instant, 'Asia/Shanghai')).toBe('2027-01-01');
  expect(calendarDate(instant, 'America/Los_Angeles')).toBe('2026-12-31');
  expect(shortTime(instant.toISOString(), 'Asia/Shanghai', 'en-GB')).toBe('01/01, 02:30');
});

it('formats timestamps with daylight saving rules rather than a fixed offset', () => {
  expect(shortTime('2026-03-08T06:30:00Z', 'America/New_York', 'en-GB')).toBe('08/03, 01:30');
  expect(shortTime('2026-03-08T07:30:00Z', 'America/New_York', 'en-GB')).toBe('08/03, 03:30');
});

it('labels zones with their UTC offset, including fractional offsets and seasonal changes', () => {
  const winter = new Date('2026-01-15T12:00:00Z');
  const summer = new Date('2026-07-15T12:00:00Z');
  expect(timeZoneLabel('Asia/Shanghai', winter)).toBe('UTC+08:00 · Asia/Shanghai');
  expect(timeZoneLabel('UTC', winter)).toBe('UTC+00:00 · UTC');
  expect(timeZoneLabel('Asia/Kathmandu', winter)).toBe('UTC+05:45 · Asia/Kathmandu');
  expect(timeZoneLabel('America/New_York', winter)).toBe('UTC-05:00 · America/New_York');
  expect(timeZoneLabel('America/New_York', summer)).toBe('UTC-04:00 · America/New_York');
});
