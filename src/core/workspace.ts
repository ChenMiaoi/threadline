import { notificationSounds, type NotificationSound } from './notification-sound';
import { defaultTypography, normalizeTypography, type TypographyPreferences } from './appearance';
import type { LanguagePreference } from '../i18n/locale';
import type { Activity } from '../features/activity/model';
import { normalizeColorTheme, type ColorThemeId, type ThemeMode } from './themes';

// Six GitHub searches (including three review queries) return at most 1,000 records each;
// 200 additional snoozes can be restored into the inbox.
export const MAX_INBOX_REVISIONS = 6200;

export interface Preferences {
  typography: TypographyPreferences;
  language: LanguagePreference;
  theme: ThemeMode;
  colorTheme: ColorThemeId;
  themeGradient: boolean;
  density: 'comfortable' | 'compact';
  reducedMotion: boolean;
  autoCheckUpdates: boolean;
  notifyAttention: boolean;
  notifyCommits: boolean;
  notifyComments: boolean;
  desktopNotifications: boolean;
  notificationSoundEnabled: boolean;
  notificationSound: NotificationSound;
  quietStart: string;
  quietEnd: string;
  refreshMinutes: 0 | 1 | 5 | 15;
}

export interface WorkspaceData {
  version: 1;
  preferences: Preferences;
  read: string[];
  snoozed: Record<string, number>;
  restored: string[];
  snoozeRecords: Record<string, Activity>;
  unread: string[];
  inboxVersion: 3;
  inboxSeen: Record<string, string[]>;
}

export interface WorkspaceRepository {
  load(): Promise<unknown>;
  save(data: WorkspaceData): Promise<void>;
}

export function nextMorning(now: number, nextMonday = false) {
  const date = new Date(now);
  const days = nextMonday ? (8 - date.getDay()) % 7 || 7 : 1;
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
}

export function defaultWorkspace(): WorkspaceData {
  return {
    version: 1,
    preferences: {
      language: 'system',
      typography: { ...defaultTypography },
      theme: 'dark',
      colorTheme: 'threadline',
      themeGradient: true,
      density: 'comfortable',
      reducedMotion: true,
      autoCheckUpdates: true,
      notifyAttention: true,
      notifyCommits: true,
      notifyComments: true,
      desktopNotifications: false,
      notificationSoundEnabled: false,
      notificationSound: 'soft',
      quietStart: '22:00',
      quietEnd: '08:00',
      refreshMinutes: 5,
    },
    read: [],
    snoozed: {},
    restored: [],
    snoozeRecords: {},
    unread: [],
    inboxVersion: 3,
    inboxSeen: {},
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ids(value: unknown, limit = 2000): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === 'string' &&
              /^(?:(inbox|review|issue|pull|snoozed)-\d+|github:\d+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+:[a-z]+:[\w-]+:[\dTZ:.-]+)$/.test(
                id,
              ),
          ),
        ),
      ].slice(-limit)
    : [];
}

export function workspaceInbox(
  records: Activity[],
  data: Pick<WorkspaceData, 'restored' | 'snoozeRecords'>,
  scope: string,
) {
  const currentThreads = new Set(records.map((record) => `${record.kind}:${record.number}`));
  const restored = data.restored
    .map((id) => data.snoozeRecords[id])
    .filter((record): record is Activity =>
      Boolean(
        record &&
        record.id.startsWith(scope) &&
        !currentThreads.has(`${record.kind}:${record.number}`),
      ),
    );
  return [...records, ...restored];
}

export function inboxReadIds(
  records: readonly Activity[],
  read: readonly string[],
  unread: readonly string[],
) {
  const ids = new Set(read);
  const explicitUnread = new Set(unread);
  for (const record of records)
    if (record.serverRead && !explicitUnread.has(record.id)) ids.add(record.id);
  return ids;
}

export function normalizeWorkspace(value: unknown, now: number): WorkspaceData {
  const defaults = defaultWorkspace();
  if (value === null) return defaults;
  if (!object(value)) throw new Error('Invalid workspace data');
  if ('version' in value && value.version !== 1)
    throw new Error('Unsupported workspace data version');
  const prefs = object(value.preferences) ? value.preferences : {};
  const settings = { ...defaults.preferences, typography: normalizeTypography(prefs.typography) };
  if (['system', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'en'].includes(String(prefs.language)))
    settings.language = prefs.language as LanguagePreference;
  if (['dark', 'light', 'system'].includes(String(prefs.theme)))
    settings.theme = prefs.theme as Preferences['theme'];
  settings.colorTheme = normalizeColorTheme(prefs.colorTheme);
  if (['comfortable', 'compact'].includes(String(prefs.density)))
    settings.density = prefs.density as Preferences['density'];
  for (const key of [
    'reducedMotion',
    'themeGradient',
    'autoCheckUpdates',
    'notifyAttention',
    'notifyCommits',
    'notifyComments',
    'desktopNotifications',
    'notificationSoundEnabled',
  ] as const)
    if (typeof prefs[key] === 'boolean') settings[key] = prefs[key];
  for (const key of ['quietStart', 'quietEnd'] as const)
    if (typeof prefs[key] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(prefs[key]))
      settings[key] = prefs[key];
  if (
    [0, 1, 5, 15].includes(Number(prefs.refreshMinutes)) &&
    typeof prefs.refreshMinutes === 'number'
  )
    settings.refreshMinutes = prefs.refreshMinutes as Preferences['refreshMinutes'];
  if (notificationSounds.includes(prefs.notificationSound as NotificationSound))
    settings.notificationSound = prefs.notificationSound as NotificationSound;
  const snoozed: Record<string, number> = {};
  if (object(value.snoozed))
    for (const id of ids(Object.keys(value.snoozed))) {
      const until = value.snoozed[id];
      if (
        typeof until === 'number' &&
        Number.isFinite(until) &&
        until > 0 &&
        until < 8640000000000000
      )
        snoozed[id] = until;
    }
  return releaseDue(
    {
      version: 1,
      preferences: settings,
      read: ids(value.read, MAX_INBOX_REVISIONS),
      snoozed: 'snoozed' in value ? snoozed : defaults.snoozed,
      restored: ids(value.restored),
      unread: ids(value.unread),
      inboxVersion: 3,
      // Older fingerprints include transient merge conditions; rebuild their checkpoint silently.
      inboxSeen:
        value.inboxVersion === 3 && object(value.inboxSeen)
          ? Object.fromEntries(
              Object.entries(value.inboxSeen)
                .filter(
                  ([scope, revisions]) =>
                    /^\d+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope) &&
                    Array.isArray(revisions) &&
                    revisions.length <= MAX_INBOX_REVISIONS,
                )
                .slice(-10)
                .map(([scope, revisions]) => [scope, ids(revisions, MAX_INBOX_REVISIONS)]),
            )
          : {},
      snoozeRecords: object(value.snoozeRecords)
        ? (Object.fromEntries(
            Object.entries(value.snoozeRecords)
              .filter(
                ([id, record]) =>
                  ids([id]).length &&
                  object(record) &&
                  record.id === id &&
                  typeof record.title === 'string' &&
                  typeof record.number === 'number' &&
                  ['summary', 'detail', 'group', 'status', 'tone', 'updated', 'category'].every(
                    (key) => typeof record[key] === 'string',
                  ) &&
                  (record.kind === 'pull' || record.kind === 'issue'),
              )
              .slice(-200),
          ) as Record<string, Activity>)
        : {},
    },
    now,
  );
}

export function releaseDue(data: WorkspaceData, now: number): WorkspaceData {
  const due = Object.keys(data.snoozed).filter((id) => data.snoozed[id] <= now);
  return restoreSnoozes(data, due);
}

export function restoreSnoozes(data: WorkspaceData, selected: readonly string[]): WorkspaceData {
  const due = selected.filter((id) => id in data.snoozed);
  if (!due.length) return data;
  const snoozed = { ...data.snoozed };
  for (const id of due) delete snoozed[id];
  const unread = due.map((id) => id.replace(/^snoozed-/, 'inbox-'));
  return {
    ...data,
    snoozed,
    read: data.read.filter((id) => !unread.includes(id)),
    unread: [...new Set([...data.unread, ...due])].slice(-2000),
    restored: [...new Set([...due, ...data.restored])].slice(0, 200),
  };
}

/** Mark only the supplied loaded revisions; preserve other repositories and explicit unread overrides. */
export function markRecordsRead(data: WorkspaceData, records: readonly string[]): WorkspaceData {
  const targets = new Set(records);
  return {
    ...data,
    read: [...new Set([...data.read, ...records])].slice(-MAX_INBOX_REVISIONS),
    unread: data.unread.filter((id) => !targets.has(id)),
  };
}
