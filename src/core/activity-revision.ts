import type { SearchRecord } from './github';

const mergeStates = [
  undefined,
  null,
  'BEHIND',
  'BLOCKED',
  'CLEAN',
  'DIRTY',
  'DRAFT',
  'HAS_HOOKS',
  'UNKNOWN',
  'UNSTABLE',
];

function fingerprint(record: SearchRecord) {
  return [
    record.title,
    record.body,
    record.state,
    record.isDraft,
    record.headRefOid,
    record.reviewDecision,
    record.reviewRequests,
    record.commits,
    record.reviews,
    record.comments,
  ];
}
function hash(fields: unknown[]) {
  const text = JSON.stringify(fields);
  let value = 2166136261;
  for (let index = 0; index < text.length; index++)
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return (value >>> 0).toString(36);
}
export function activityKind(record: SearchRecord) {
  return record.__typename === 'PullRequest' || record.url.includes('/pull/') ? 'pull' : 'issue';
}
export function activityUpdatedAt(record: SearchRecord) {
  const comment = record.comments.nodes.at(-1);
  const review = record.reviews?.nodes
    .filter((entry) => entry.submittedAt)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .at(-1);
  return [
    record.updatedAt,
    comment?.updatedAt ?? comment?.createdAt,
    review?.updatedAt ?? review?.submittedAt,
    record.commits?.nodes[0]?.commit.committedDate,
  ]
    .filter((time): time is string => Boolean(time))
    .sort()
    .at(-1)!;
}
export function activityRevisionId(
  record: SearchRecord,
  account: number,
  repo: string,
  updatedAt = activityUpdatedAt(record),
) {
  // Merge conditions are recomputed by GitHub without a collaboration event.
  return `github:${account}:${repo}:activity:${activityKind(record)}-${record.number}-v3-${hash(fingerprint(record))}:${updatedAt}`;
}
export function legacyActivityRevisionIds(record: SearchRecord, account: number, repo: string) {
  const fields = fingerprint(record);
  const updatedAt = activityUpdatedAt(record);
  return [
    ...new Set(
      mergeStates.map((mergeState) => {
        const previous = [...fields.slice(0, 6), mergeState, ...fields.slice(6)];
        return `github:${account}:${repo}:activity:${activityKind(record)}-${record.number}-${hash(previous)}:${updatedAt}`;
      }),
    ),
  ];
}
export function isLegacyActivityId(id: string) {
  return /^github:\d+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+:activity:(pull|issue)-\d+-[a-z0-9]+:[\dTZ:.-]+$/.test(
    id,
  );
}
