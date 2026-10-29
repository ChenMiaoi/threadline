import type { Activity } from '../features/activity/model';
import type { Preferences } from './workspace';

export function chronological(records: readonly Activity[]) {
  return [...records].sort(
    (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.number - a.number,
  );
}

export function newUpdates(records: readonly Activity[], seen: readonly string[] | undefined) {
  if (!seen) return [];
  const known = new Set(seen);
  return chronological(records.filter((record) => !known.has(record.id)));
}

export function quietHours(preferences: Preferences, now: Date) {
  const minute = now.getHours() * 60 + now.getMinutes();
  const parse = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = parse(preferences.quietStart);
  const end = parse(preferences.quietEnd);
  return start === end
    ? false
    : start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
}

export function shouldNotify(record: Activity, preferences: Preferences) {
  return record.changeType === 'comment'
    ? preferences.notifyComments
    : record.changeType === 'commit'
      ? preferences.notifyCommits
      : preferences.notifyAttention;
}

// GitHub can change checks or HEAD without advancing the thread's updatedAt.
// Keep the first observation time stable until the revision changes again.
export function observeUpdates(records: Activity[], previous: Activity[], fetchedAt: number) {
  const observed = new Map<string, Activity>();
  for (const record of previous) {
    const key = `${record.kind}:${record.number}`;
    if (!observed.has(key)) observed.set(key, record);
  }
  return records.map((record) => {
    const before = observed.get(`${record.kind}:${record.number}`);
    if (!before?.updatedAt) return record;
    const updatedAt =
      before.id === record.id
        ? before.updatedAt
        : new Date(Math.max(Date.parse(record.updatedAt ?? '') || 0, fetchedAt)).toISOString();
    return {
      ...record,
      updatedAt,
      updated: new Date(updatedAt).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  });
}
