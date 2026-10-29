import type { Activity } from '../features/activity/model';
import type { PullRequest } from '../features/pulls/model';

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
}
export interface GitHubRepository {
  id: number;
  full_name: string;
  private: boolean;
  description: string | null;
}
export interface GitHubSession {
  user: GitHubUser;
  selected: string | null;
  notificationsAvailable?: boolean;
  installationUrl?: string;
  authProvider?: 'github-app';
}
export interface GitHubResponse<T> {
  payload: T;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
  timing?: {
    totalMs: number;
    stages: { stage: string; elapsedMs: number }[];
    requests: { stage: string; elapsedMs: number; offsetMs: number }[];
  };
}
export interface GitHubLoginState {
  status: 'idle' | 'starting' | 'waiting' | 'complete' | 'error' | 'cancelled';
  code: string | null;
  verificationUrl: string | null;
  error: string | null;
}
export type GitHubOperation =
  | 'repositories'
  | 'repository'
  | 'authored'
  | 'review'
  | 'issues'
  | 'inbox'
  | 'detail'
  | 'issue'
  | 'pull'
  | 'discussion'
  | 'files'
  | 'checks';
export interface GitHubGateway {
  session(): Promise<GitHubSession>;
  request<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number?: number,
    head?: string,
  ): Promise<GitHubResponse<T>>;
  select(repo: string, accountId: number): Promise<void>;
  login(): Promise<GitHubLoginState>;
  loginStatus(): Promise<GitHubLoginState>;
  cancelLogin(): Promise<GitHubLoginState>;
  logout(): Promise<void>;
  open(url: string): Promise<void>;
}
interface Author {
  login: string;
}
export interface GitHubReview {
  state: string;
  body: string;
  submittedAt: string;
  author: Author | null;
  commit: { oid: string } | null;
}
export interface SearchRecord {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  updatedAt: string;
  author: Author | null;
  isDraft?: boolean;
  headRefOid?: string;
  reviewDecision?: string | null;
  reviews?: { totalCount: number; nodes: GitHubReview[] };
  reviewRequests?: { nodes: { requestedReviewer: { login?: string; name?: string } | null }[] };
  commits?: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
  comments: {
    totalCount: number;
    nodes: { body: string; author: Author | null; createdAt: string }[];
  };
  labels?: { nodes: { name: string }[] };
  participants?: { nodes: Author[] };
}
export interface SearchPage {
  data: { search: { issueCount: number; nodes: SearchRecord[] } };
}
export interface GitHubNotification {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  subject: { title: string; url: string | null; type: string };
  repository: { id: number; full_name: string };
}
export function searchRecords(pages: SearchPage[]): SearchRecord[] {
  return [
    ...new Map(
      pages
        .flatMap((p) => p.data.search.nodes)
        .filter(Boolean)
        .map((record) => [record.number, record]),
    ).values(),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function recordId(
  account: number,
  repo: string,
  kind: string,
  number: number | string,
  updated: string,
) {
  return `github:${account}:${repo}:${kind}:${number}:${updated}`;
}
export function shortTime(time: string) {
  return new Date(time).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function previewText(value: string) {
  const text = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}
function compactTime(time: string, now = Date.now()) {
  const age = Math.max(0, now - Date.parse(time));
  return age < 60000
    ? '刚刚'
    : age < 3600000
      ? `${Math.floor(age / 60000)}m`
      : age < 86400000
        ? `${Math.floor(age / 3600000)}h`
        : age < 604800000
          ? `${Math.floor(age / 86400000)}d`
          : new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
export function pullFromGitHub(record: SearchRecord, account: number, repo: string): PullRequest {
  const state = record.state.toLowerCase() as PullRequest['state'];
  const decision = record.reviewDecision;
  const status = record.isDraft
    ? '草稿'
    : state === 'merged'
      ? '已合并'
      : state === 'closed'
        ? '已关闭'
        : decision === 'CHANGES_REQUESTED'
          ? '请求修改'
          : decision === 'APPROVED'
            ? '已批准'
            : '等待评审';
  const check = record.commits?.nodes[0]?.commit.statusCheckRollup?.state;
  const reviewer = record.reviewRequests?.nodes[0]?.requestedReviewer;
  const comment = record.comments.nodes[0];
  return {
    id: recordId(account, repo, 'pull', record.number, record.updatedAt),
    url: record.url,
    number: record.number,
    title: record.title,
    state,
    group: record.isDraft
      ? '草稿'
      : decision === 'CHANGES_REQUESTED'
        ? '需要我的处理'
        : state === 'open'
          ? '等待评审'
          : status,
    status,
    tone: decision === 'CHANGES_REQUESTED' ? 'yellow' : state === 'open' ? 'blue' : 'muted',
    check:
      check === 'SUCCESS'
        ? 'passed'
        : check === 'FAILURE' || check === 'ERROR'
          ? 'failed'
          : check
            ? 'pending'
            : 'none',
    reviewer:
      reviewer?.login ?? reviewer?.name ?? record.reviews?.nodes.at(-1)?.author?.login ?? '',
    updated: compactTime(record.updatedAt),
    summary: previewText(comment?.body || record.body || '暂无说明'),
    author: record.author?.login ?? '已删除用户',
    previewAuthor: comment?.author?.login ?? record.author?.login ?? '已删除用户',
  };
}
export function issueFromGitHub(
  record: SearchRecord,
  account: number,
  repo: string,
  login: string,
): Activity {
  const authored = record.author?.login === login;
  return {
    id: recordId(account, repo, 'issue', record.number, record.updatedAt),
    kind: 'issue',
    number: record.number,
    title: record.title,
    url: record.url,
    summary: previewText(record.comments.nodes[0]?.body || record.body || '暂无说明'),
    detail: `${record.author?.login ?? '已删除用户'} · ${record.labels?.nodes.map((l) => l.name).join(' · ') || '无标签'}`,
    labels: record.labels?.nodes.map((label) => label.name) ?? [],
    group: authored ? '我发起的' : '我参与的',
    status: record.state === 'OPEN' ? '开放' : '已关闭',
    state: record.state === 'OPEN' ? 'open' : 'closed',
    tone: record.state === 'OPEN' ? 'blue' : 'muted',
    updated: compactTime(record.updatedAt),
    category: authored ? 'authored' : 'participated',
  };
}
export function reviewFromGitHub(
  record: SearchRecord,
  account: number,
  repo: string,
  login: string,
): Activity {
  const reviews =
    record.reviews?.nodes.filter(
      (r) =>
        r.author?.login === login &&
        ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state),
    ) ?? [];
  const latest = reviews.at(-1);
  const review = latest?.state === 'DISMISSED' ? undefined : latest;
  const requested = record.reviewRequests?.nodes.some((r) => r.requestedReviewer?.login === login);
  // The last 100 reviews are explicit; do not infer an absent formal review when truncated.
  const truncated = (record.reviews?.totalCount ?? 0) > (record.reviews?.nodes.length ?? 0);
  const changed = review?.commit?.oid !== record.headRefOid;
  const category = review
    ? changed
      ? 'updated'
      : review.state === 'CHANGES_REQUESTED'
        ? 'waiting'
        : 'reviewed'
    : requested
      ? 'updated'
      : 'discussion';
  const status = review
    ? changed
      ? '需要复查'
      : review.state === 'CHANGES_REQUESTED'
        ? '等待作者'
        : '已评审'
    : requested
      ? '待评审'
      : truncated
        ? '评审历史未完整加载'
        : '仅参与讨论';
  return {
    id: recordId(account, repo, 'review', record.number, record.updatedAt),
    kind: 'pull',
    number: record.number,
    title: record.title,
    url: record.url,
    summary: status,
    detail: review
      ? `评审版本 ${review.commit?.oid.slice(0, 7) ?? '未知'} · 当前 HEAD ${record.headRefOid?.slice(0, 7) ?? '未知'}${changed ? ' · 代码版本已变化' : ''}`
      : previewText(record.comments.nodes[0]?.body || record.body || '暂无说明'),
    group: status,
    status,
    tone: category === 'updated' ? 'yellow' : category === 'waiting' ? 'blue' : 'muted',
    updated: compactTime(record.updatedAt),
    category,
    state: record.state === 'OPEN' ? 'open' : 'closed',
  };
}
export function notificationFromGitHub(record: GitHubNotification, account: number): Activity {
  const number = Number(record.subject.url?.split('/').at(-1));
  const kind = record.subject.type === 'PullRequest' ? 'pull' : 'issue';
  const mentioned = ['mention', 'team_mention'].includes(record.reason);
  return {
    id: recordId(
      account,
      record.repository.full_name,
      'notification',
      record.id,
      record.updated_at,
    ),
    kind,
    number,
    title: record.subject.title,
    url: `https://github.com/${record.repository.full_name}/${kind === 'pull' ? 'pull' : 'issues'}/${number}`,
    summary:
      (
        {
          mention: '提及我',
          team_mention: '提及我的团队',
          review_requested: '请求评审',
          comment: '评论更新',
          author: '我发起的讨论',
          state_change: '状态变化',
          subscribed: '订阅更新',
          assign: '指派给我',
        } as Record<string, string>
      )[record.reason] ?? record.reason,
    detail: record.repository.full_name,
    group: mentioned ? '提及我的' : '仓库通知',
    status: record.unread ? '未读' : '已读',
    tone: mentioned ? 'yellow' : 'blue',
    updated: compactTime(record.updated_at),
    category: mentioned ? 'attention' : 'notification',
    mentioned,
    serverRead: !record.unread,
  };
}

export interface RestComment {
  id: number;
  body: string;
  user: Author | null;
  created_at: string;
  path?: string;
}
export interface RestReview {
  id: number;
  body: string;
  state: string;
  user: Author | null;
  submitted_at: string | null;
  commit_id: string;
}
export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}
export interface CommitStatus {
  context: string;
  state: string;
}
export interface PullDetail {
  pull: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    merged: boolean;
    draft: boolean;
    user: Author | null;
    head: { sha: string; ref: string };
    base: { ref: string };
    additions: number;
    deletions: number;
    changed_files: number;
    commits: number;
  };
  comments: RestComment[][];
  reviews: RestReview[][];
  reviewComments: RestComment[][];
  files: {
    filename: string;
    additions: number;
    deletions: number;
    patch?: string;
    status: string;
  }[][];
  checks: { check_runs: CheckRun[] }[] | null;
  statuses: { statuses: CommitStatus[] }[] | null;
  checkError: string | null;
}
export interface IssueDetail {
  issue: { body: string | null; user: Author | null };
  comments: RestComment[][];
}
