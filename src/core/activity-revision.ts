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

function fingerprint(record: SearchRecord, includeCommentHistory = false) {
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
    // Fetching a larger history window is not a new collaboration event.
    includeCommentHistory
      ? record.comments
      : { totalCount: record.comments.totalCount, nodes: record.comments.nodes.slice(-1) },
  ];
}
function previousShortFingerprint(record: SearchRecord) {
  const fields = fingerprint(record, true);
  // Preserve the serialized field order used by the released v3 fingerprint.
  fields[fields.length - 1] = { ...record.comments, nodes: record.comments.nodes.slice(-1) };
  return fields;
}
export function revisionFingerprint(fields: unknown[]) {
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
  return `github:${account}:${repo}:activity:${activityKind(record)}-${record.number}-v4-${revisionFingerprint(fingerprint(record))}:${updatedAt}`;
}
export function legacyActivityRevisionIds(record: SearchRecord, account: number, repo: string) {
  const fields = previousShortFingerprint(record);
  const updatedAt = activityUpdatedAt(record);
  return [
    ...new Set(
      mergeStates.map((mergeState) => {
        const previous = [...fields.slice(0, 6), mergeState, ...fields.slice(6)];
        return `github:${account}:${repo}:activity:${activityKind(record)}-${record.number}-${revisionFingerprint(previous)}:${updatedAt}`;
      }),
    ),
  ];
}
export function isLegacyActivityId(id: string) {
  return /^github:\d+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+:activity:(pull|issue)-\d+-(?:v3-)?[a-z0-9]+:[\dTZ:.-]+$/.test(
    id,
  );
}

export function previousActivityRevisionIds(record: SearchRecord, account: number, repo: string) {
  const prefix = `github:${account}:${repo}:activity:${activityKind(record)}-${record.number}-v3-`;
  const updatedAt = activityUpdatedAt(record);
  return [
    ...new Set([
      ...legacyActivityRevisionIds(record, account, repo),
      // v0.1.2 fetched one comment; v0.1.3 hashed up to twenty comments.
      `${prefix}${revisionFingerprint(previousShortFingerprint(record))}:${updatedAt}`,
      `${prefix}${revisionFingerprint(fingerprint(record, true))}:${updatedAt}`,
    ]),
  ];
}
