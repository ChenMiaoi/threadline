export interface Preferences {
  theme: 'dark' | 'light' | 'system';
  density: 'comfortable' | 'compact';
  reducedMotion: boolean;
  notifyAttention: boolean;
  notifyCommits: boolean;
  notifyComments: boolean;
  desktopNotifications: boolean;
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

export function defaultWorkspace(now: number): WorkspaceData {
  return {
    version: 1,
    preferences: {
      theme: 'dark',
      density: 'comfortable',
      reducedMotion: true,
      notifyAttention: true,
      notifyCommits: true,
      notifyComments: true,
      desktopNotifications: false,
      quietStart: '22:00',
      quietEnd: '08:00',
      refreshMinutes: 5,
    },
    read: [],
    snoozed: { 'snoozed-1031': nextMorning(now), 'snoozed-286': nextMorning(now, true) },
    restored: [],
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === 'string' && /^(inbox|review|issue|pull|snoozed)-\d+$/.test(id),
          ),
        ),
      ].slice(0, 200)
    : [];
}

export function normalizeWorkspace(value: unknown, now: number): WorkspaceData {
  const defaults = defaultWorkspace(now);
  if (value === null) return defaults;
  if (!object(value)) throw new Error('Invalid workspace data');
  if ('version' in value && value.version !== 1)
    throw new Error('Unsupported workspace data version');
  const prefs = object(value.preferences) ? value.preferences : {};
  const settings = { ...defaults.preferences };
  if (['dark', 'light', 'system'].includes(String(prefs.theme)))
    settings.theme = prefs.theme as Preferences['theme'];
  if (['comfortable', 'compact'].includes(String(prefs.density)))
    settings.density = prefs.density as Preferences['density'];
  for (const key of [
    'reducedMotion',
    'notifyAttention',
    'notifyCommits',
    'notifyComments',
    'desktopNotifications',
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
      read: ids(value.read),
      snoozed: 'snoozed' in value ? snoozed : defaults.snoozed,
      restored: ids(value.restored),
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
    restored: [...new Set([...due, ...data.restored])].slice(0, 200),
  };
}
