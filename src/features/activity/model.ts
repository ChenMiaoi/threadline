export type ActivityView = 'inbox' | 'review' | 'issues';
export interface Activity {
  url?: string;
  labels?: string[];
  state?: 'open' | 'closed';
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

export function filterActivities(
  records: readonly Activity[],
  filter: string,
  query: string,
  read: readonly string[],
  snoozed: readonly string[] = [],
) {
  const search = query.trim().toLowerCase();
  return records.filter(
    (record) =>
      !snoozed.includes(record.id) &&
      (filter === 'all' ||
        ((filter === 'open' || filter === 'closed') && record.state === filter) ||
        (filter === 'unread'
          ? !read.includes(record.id)
          : filter === 'mentions'
            ? record.mentioned
            : record.category === filter)) &&
      `${record.number} ${record.title} ${record.summary} ${record.detail}`
        .toLowerCase()
        .includes(search),
  );
}

export function groupActivities(records: readonly Activity[]) {
  const groups = new Map<string, Activity[]>();
  for (const record of records)
    groups.set(record.group, [...(groups.get(record.group) ?? []), record]);
  const priority: Record<string, number> = {
    attention: 0,
    updated: 0,
    authored: 0,
    waiting: 1,
    notification: 1,
    participated: 1,
    reviewed: 2,
    discussion: 3,
  };
  return [...groups].sort(
    ([, left], [, right]) =>
      (priority[left[0].category] ?? 99) - (priority[right[0].category] ?? 99),
  );
}
