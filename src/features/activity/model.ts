import type { PullStatus, StatusBadge } from '../../core/pull-status';
export type ActivityView = 'inbox' | 'review' | 'issues';
export interface Activity {
  author?: string;
  selfEvent?: boolean;
  collaborationKey?: string;
  externalEventAt?: string;
  externalRevision?: string;
  updatedAt?: string;
  headSha?: string;
  changeType?: 'comment' | 'commit' | 'attention';
  pullStatus?: PullStatus;
  personalReview?: StatusBadge;
  needsAttention?: boolean;
  url?: string;
  labels?: string[];
  state?: 'open' | 'closed' | 'merged';
  serverRead?: boolean;
  id: string;
  kind: 'pull' | 'issue';
  number: number;
  title: string;
  summary: string;
  detail: string;
  group: string;
  status: string;
  tone: 'yellow' | 'blue' | 'accent' | 'muted' | 'green' | 'dim';
  updated: string;
  category: string;
  mentioned?: boolean;
}

type ActivityIds = readonly string[] | ReadonlySet<string>;

function idSet(ids: ActivityIds): ReadonlySet<string> {
  return Array.isArray(ids) ? new Set(ids) : (ids as ReadonlySet<string>);
}

function matchesFilter(record: Activity, filter: string, read: ReadonlySet<string>) {
  return (
    filter === 'all' ||
    ((filter === 'pull' || filter === 'issue') && record.kind === filter) ||
    ((filter === 'open' || filter === 'closed') && record.state === filter) ||
    (filter === 'unread'
      ? !read.has(record.id)
      : filter === 'mentions'
        ? record.mentioned
        : record.category === filter)
  );
}

export function filterActivities(
  records: readonly Activity[],
  filter: string,
  query: string,
  read: ActivityIds,
  snoozed: ActivityIds = [],
) {
  const search = query.trim().toLowerCase();
  const readIds = idSet(read);
  const snoozedIds = idSet(snoozed);
  return records.filter(
    (record) =>
      !snoozedIds.has(record.id) &&
      matchesFilter(record, filter, readIds) &&
      (!search ||
        `${record.number} ${record.title} ${record.summary} ${record.detail}`
          .toLowerCase()
          .includes(search)),
  );
}

export function activityCounts(
  records: readonly Activity[],
  filters: readonly string[],
  read: ActivityIds,
  snoozed: ActivityIds = [],
) {
  const readIds = idSet(read);
  const snoozedIds = idSet(snoozed);
  const counts: Record<string, number> = Object.fromEntries(filters.map((filter) => [filter, 0]));
  for (const record of records) {
    if (snoozedIds.has(record.id)) continue;
    for (const filter of filters) if (matchesFilter(record, filter, readIds)) counts[filter]++;
  }
  return counts;
}

export function groupActivities(records: readonly Activity[]) {
  const groups = new Map<string, Activity[]>();
  for (const record of records) {
    const group = groups.get(record.group);
    if (group) group.push(record);
    else groups.set(record.group, [record]);
  }
  const priority: Record<string, number> = {
    attention: 0,
    requested: 0,
    updated: 0,
    authored: 0,
    waiting: 1,
    notification: 1,
    participated: 1,
    reviewed: 2,
    discussion: 3,
    unverified: 3,
    draft: 4,
    finished: 5,
  };
  return [...groups].sort(
    ([, left], [, right]) =>
      (priority[left[0].category] ?? 99) - (priority[right[0].category] ?? 99),
  );
}
