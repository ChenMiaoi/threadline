import type { Activity } from '../activity/model';

export function snoozeActivityIndex(
  records: readonly Activity[],
  saved: Readonly<Record<string, Activity>>,
) {
  const index = new Map<string, Activity>();
  for (const record of records) if (!index.has(record.id)) index.set(record.id, record);
  for (const [id, record] of Object.entries(saved))
    if (!index.has(id) && record) index.set(id, record);
  return index;
}
