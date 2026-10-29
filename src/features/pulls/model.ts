export type PullState = 'open' | 'merged' | 'closed';
export type CheckState = 'passed' | 'failed' | 'none' | 'pending';
export interface PullRequest {
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
      (!attentionOnly || pull.group === '需要我的处理') &&
      `${pull.number} ${pull.title} ${pull.status}`.toLowerCase().includes(normalized),
  );
}

export function groupPullRequests(pulls: readonly PullRequest[]) {
  const groups = new Map<string, PullRequest[]>();
  for (const pull of pulls) groups.set(pull.group, [...(groups.get(pull.group) ?? []), pull]);
  const order = ['需要我的处理', '等待评审', '草稿'];
  const priority = (group: string) => {
    const index = order.indexOf(group);
    return index < 0 ? order.length : index;
  };
  return [...groups.entries()].sort(([left], [right]) => priority(left) - priority(right));
}
