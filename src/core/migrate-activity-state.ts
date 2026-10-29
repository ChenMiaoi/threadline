import type { Activity } from '../features/activity/model';
import type { SearchRecord } from './github';
import type { WorkspaceData } from './workspace';
import {
  activityKind,
  activityRevisionId,
  isLegacyActivityId,
  legacyActivityRevisionIds,
} from './activity-revision';

export function legacyActivityStateIds(data: WorkspaceData) {
  return [
    ...new Set([
      ...data.read,
      ...data.unread,
      ...data.restored,
      ...Object.keys(data.snoozed),
      ...Object.keys(data.snoozeRecords),
    ]),
  ].filter(isLegacyActivityId);
}

export function findLegacyActivityAliases(
  records: readonly SearchRecord[],
  targets: readonly Activity[],
  ids: readonly string[],
  account: number,
  repo: string,
): Map<string, Activity> {
  const pending = new Set(ids.filter(isLegacyActivityId));
  const aliases = new Map<string, Activity>();
  if (!pending.size || !targets.length) return aliases;
  const threads = new Set([...pending].map((id) => id.replace(/-[a-z0-9]+:[\dTZ:.-]+$/, '-')));
  const current = new Map(targets.map((record) => [record.id, record]));
  const checked = new Set<string>();
  for (const record of records) {
    const prefix = `github:${account}:${repo}:activity:${activityKind(record)}-${record.number}-`;
    if (!threads.has(prefix)) continue;
    const id = activityRevisionId(record, account, repo);
    const target = current.get(id);
    if (!target || checked.has(id)) continue;
    checked.add(id);
    for (const previous of legacyActivityRevisionIds(record, account, repo))
      if (pending.has(previous)) aliases.set(previous, target);
  }
  return aliases;
}

export function migrateActivityState(data: WorkspaceData, aliases: ReadonlyMap<string, Activity>) {
  if (!aliases.size) return data;
  const target = (id: string) => aliases.get(id)?.id ?? id;
  const mapIds = (ids: string[]) => [...new Set(ids.map(target))];
  const snoozed: Record<string, number> = {};
  for (const [id, until] of Object.entries(data.snoozed)) {
    const next = target(id);
    snoozed[next] = Math.max(snoozed[next] ?? 0, until);
  }
  const snoozeRecords: Record<string, Activity> = {};
  for (const [id, record] of Object.entries(data.snoozeRecords)) {
    const next = target(id);
    snoozeRecords[next] = aliases.get(id) ?? record;
  }
  const read = mapIds(data.read);
  const unread = mapIds(data.unread);
  const explicitUnread = new Set(unread);
  const movedChoices = new Set(
    [...data.read, ...data.unread].filter((id) => aliases.has(id)).map(target),
  );
  return {
    ...data,
    // When old aliases collapse, preserve an explicit unread choice over a read choice.
    read: read.filter((id) => !movedChoices.has(id) || !explicitUnread.has(id)),
    unread,
    restored: mapIds(data.restored),
    snoozed,
    snoozeRecords,
  };
}
