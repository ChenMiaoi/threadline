import type { PullStatus } from '../../core/pull-status';
export type PullState = 'open' | 'merged' | 'closed';
export type CheckState = 'passed' | 'failed' | 'none' | 'pending';
export interface PullRequest {
  presentation?: PullStatus;
  id?: string;
  url?: string;
  summary?: string;
  author?: string;
  previewAuthor?: string;
  number: number;
  title: string;
  state: PullState;
  group: string;
  status: string;
  tone: 'yellow' | 'blue' | 'muted';
  check: CheckState;
  reviewer: string;
  updated: string;
}

export function filterPullRequests(
  pulls: readonly PullRequest[],
  state: PullState,
  query: string,
  attentionOnly = false,
) {
  const normalized = query.trim().toLowerCase().replace(/^#/, '');
  return pulls.filter(
    (pull) =>
      pull.state === state &&
      (!attentionOnly || (pull.presentation?.needsAuthorAction ?? pull.group === '需要我的处理')) &&
      (!normalized ||
        `${pull.number} ${pull.title} ${pull.status} ${pull.presentation?.review.label ?? ''} ${pull.presentation?.merge.label ?? ''} ${pull.presentation?.checks.label ?? ''} ${pull.presentation?.nextAction ?? ''}`
          .toLowerCase()
          .includes(normalized)),
  );
}

export function pullStateCounts(pulls: readonly PullRequest[]) {
  const counts = { open: 0, merged: 0, closed: 0 };
  for (const pull of pulls) counts[pull.state]++;
  return counts;
}

export function groupPullRequests(pulls: readonly PullRequest[]) {
  const groups = new Map<string, PullRequest[]>();
  for (const pull of pulls) {
    const group = groups.get(pull.group);
    if (group) group.push(pull);
    else groups.set(pull.group, [pull]);
  }
  const order = [
    '需要我的处理',
    '合并条件未满足',
    '等待评审',
    '评审已通过',
    '合并条件已满足',
    '评审状态待确认',
    '草稿',
  ];
  const priority = (group: string) => {
    const index = order.indexOf(group);
    return index < 0 ? order.length : index;
  };
  return [...groups.entries()].sort(([left], [right]) => priority(left) - priority(right));
}
