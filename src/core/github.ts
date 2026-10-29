import { describePull } from './pull-status';
import { activityRevisionId } from './activity-revision';
import type { StatusBadge } from './pull-status';
import type { Activity } from '../features/activity/model';
import type { PullRequest } from '../features/pulls/model';

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url?: string | null;
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
  | 'profile'
  | 'repositories'
  | 'repository'
  | 'authored'
  | 'review'
  | 'issues'
  | 'inbox'
  | 'activity'
  | 'detail'
  | 'issue'
  | 'pull'
  | 'discussion'
  | 'files'
  | 'checks';
export interface GitHubGateway {
  session(): Promise<GitHubSession>;
  cachedSession?(): Promise<GitHubSession | null>;
  cached?<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number?: number,
    head?: string,
    searchDays?: number,
  ): Promise<GitHubResponse<T> | null>;
  request<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number?: number,
    head?: string,
    searchDays?: number,
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
  updatedAt?: string;
  author: Author | null;
  commit: { oid: string } | null;
}
export interface SearchRecord {
  __typename?: string;
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
  mergeStateStatus?: string | null;
  mergeable?: string | null;
  reviews?: { totalCount: number; nodes: GitHubReview[] };
  reviewRequests?: { nodes: { requestedReviewer: { login?: string; name?: string } | null }[] };
  commits?: {
    nodes: { commit: { committedDate?: string; statusCheckRollup: { state: string } | null } }[];
  };
  comments: {
    totalCount: number;
    nodes: { body: string; author: Author | null; createdAt: string; updatedAt?: string }[];
  };
  labels?: { nodes: { name: string }[] };
  participants?: { nodes: Author[] };
}
export interface SearchPage {
  data: { search: { issueCount: number; truncated?: boolean; nodes: SearchRecord[] } };
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
    .replace(/```[\s\S]*?```/g, ' [代码片段] ')
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^\s*(?:>\s*)+/gm, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+)/gm, '')
    .replace(/:(?:white_check_mark|penguin|window|wave):/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
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
  const check = record.commits?.nodes[0]?.commit.statusCheckRollup?.state;
  const presentation = describePull({ ...record, checkState: check });
  const { state } = presentation;
  const status =
    state !== 'open' || presentation.draft
      ? presentation.lifecycle.label
      : presentation.review.label;
  const reviewer = record.reviewRequests?.nodes[0]?.requestedReviewer;
  const comment = record.comments.nodes[0];
  return {
    id: recordId(account, repo, 'pull', record.number, record.updatedAt),
    url: record.url,
    number: record.number,
    title: record.title,
    state,
    presentation,
    group: presentation.group,
    status,
    tone: presentation.needsAuthorAction ? 'yellow' : state === 'open' ? 'blue' : 'muted',
    check:
      check === 'SUCCESS'
        ? 'passed'
        : check === 'FAILURE' || check === 'ERROR'
          ? 'failed'
          : check
            ? 'pending'
            : 'none',
    reviewer: state === 'open' ? (reviewer?.login ?? reviewer?.name ?? '') : '',
    updated: compactTime(record.updatedAt),
    updatedAt: record.updatedAt,
    headSha: record.headRefOid,
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
    updatedAt: record.updatedAt,
    headSha: record.headRefOid,
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
  const latest = reviews
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
    .at(-1);
  const review = latest?.state === 'DISMISSED' ? undefined : latest;
  const requested = record.reviewRequests?.nodes.some((r) => r.requestedReviewer?.login === login);
  // The last 100 reviews are explicit; do not infer an absent formal review when truncated.
  const truncated = (record.reviews?.totalCount ?? 0) > (record.reviews?.nodes.length ?? 0);
  const presentation = describePull({
    ...record,
    checkState: record.commits?.nodes[0]?.commit.statusCheckRollup?.state,
  });
  const knownVersion = Boolean(review?.commit?.oid && record.headRefOid);
  const changed = knownVersion && review?.commit?.oid !== record.headRefOid;
  const category =
    presentation.state !== 'open'
      ? 'finished'
      : presentation.draft
        ? 'draft'
        : requested
          ? 'requested'
          : review
            ? !knownVersion
              ? 'unverified'
              : changed
                ? 'updated'
                : review.state === 'CHANGES_REQUESTED'
                  ? 'waiting'
                  : 'reviewed'
            : truncated
              ? 'unverified'
              : 'discussion';
  const status = (
    {
      finished: presentation.lifecycle.label,
      draft: '草稿',
      requested: '待我评审',
      updated: '评审后有新提交',
      waiting: '等待作者修改',
      reviewed: '我已批准',
      unverified: review ? '评审版本待确认' : '评审历史不完整',
      discussion: latest?.state === 'DISMISSED' ? '评审已撤销' : '仅参与讨论',
    } as Record<string, string>
  )[category];
  const nextAction =
    category === 'finished'
      ? '流程已结束，无需继续评审'
      : category === 'draft'
        ? '等待作者将草稿标记为可评审'
        : category === 'requested'
          ? '作者已请求你评审'
          : category === 'updated'
            ? '查看新提交，确认是否需要重新评审'
            : category === 'waiting'
              ? '等待作者按你的评审意见修改'
              : category === 'reviewed'
                ? '你的批准对应当前 HEAD；合并还需满足仓库条件'
                : category === 'unverified' || truncated
                  ? '打开详情确认个人评审历史与版本'
                  : latest?.state === 'DISMISSED'
                    ? '你的正式评审已撤销；需要时重新提交评审'
                    : '普通评论不代表已批准或要求变更';
  const personalReview: StatusBadge =
    latest?.state === 'DISMISSED'
      ? {
          label: '已撤销',
          tone: 'neutral',
          description: '你最近的正式评审已被撤销，不将之前的批准当作当前有效结论。',
        }
      : review
        ? {
            label: `${review.state === 'APPROVED' ? '已批准' : '要求变更'}${changed ? ' · 旧版本' : knownVersion ? ' · 当前版本' : ' · 版本待确认'}`,
            tone: review.state === 'APPROVED' ? 'success' : 'warning',
            description: '这是当前账号的个人评审，和 GitHub 汇总评审结论分别展示。',
          }
        : {
            label: truncated ? '历史不完整' : '未提交正式结论',
            tone: 'neutral',
            description: truncated
              ? '最近100条评审不足以确定你的完整评审历史。'
              : '普通评论不表示正式批准或要求变更。',
          };
  return {
    id: recordId(account, repo, 'review', record.number, record.updatedAt),
    kind: 'pull',
    number: record.number,
    title: record.title,
    url: record.url,
    summary: nextAction,
    pullStatus: presentation,
    personalReview,
    needsAttention: ['requested', 'updated', 'unverified'].includes(category),
    detail: review
      ? `评审版本 ${review.commit?.oid.slice(0, 7) ?? '未知'} · 当前 HEAD ${record.headRefOid?.slice(0, 7) ?? '未知'}${changed ? ' · 代码版本已变化' : ''}`
      : previewText(record.comments.nodes[0]?.body || record.body || '暂无说明'),
    group: status,
    status,
    tone: category === 'updated' ? 'yellow' : category === 'waiting' ? 'blue' : 'muted',
    updated: compactTime(record.updatedAt),
    updatedAt: record.updatedAt,
    headSha: record.headRefOid,
    category,
    state: presentation.state,
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
    updatedAt: record.updated_at,
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
    reviewDecision?: string | null;
    mergeStateStatus?: string | null;
    mergeable?: string | null;
    checkState?: string | null;
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

/** The inbox is a thread list; each new revision replaces the previous revision. */
export function activityFromGitHub(
  record: SearchRecord,
  account: number,
  repo: string,
  login: string,
): Activity {
  const pull = record.__typename === 'PullRequest' || record.url.includes('/pull/');
  const activity = pull
    ? reviewFromGitHub(record, account, repo, login)
    : issueFromGitHub(record, account, repo, login);
  const comment = record.comments.nodes.at(-1);
  const review = record.reviews?.nodes
    .filter((r) => r.submittedAt)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .at(-1);
  const latest = [
    record.updatedAt,
    comment?.updatedAt ?? comment?.createdAt,
    review?.updatedAt ?? review?.submittedAt,
    record.commits?.nodes[0]?.commit.committedDate,
  ]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)!;
  const recentComment = comment && (comment.updatedAt ?? comment.createdAt) === latest;
  const recentReview = review && (review.updatedAt ?? review.submittedAt) === latest;
  return {
    ...activity,
    id: activityRevisionId(record, account, repo, latest),
    updatedAt: latest,
    updated: shortTime(latest),
    summary: recentComment
      ? `${comment.author?.login ?? '已删除用户'}：${previewText(comment.body)}`
      : recentReview
        ? `${review.author?.login ?? '已删除用户'} · ${{ APPROVED: '批准评审', CHANGES_REQUESTED: '要求变更', COMMENTED: '评审评论', DISMISSED: '评审已撤销' }[review.state] ?? '评审更新'}${review.body ? `：${previewText(review.body)}` : ''}`
        : '内容或状态有更新',
    detail: activity.pullStatus
      ? `PR · ${activity.pullStatus.lifecycle.label}${activity.pullStatus.state === 'open' && !activity.pullStatus.draft && activity.pullStatus.review.tone !== 'neutral' ? ` · ${activity.pullStatus.review.label}` : ''}`
      : `Issue · ${activity.status}`,
    category: recentComment || recentReview ? 'comment' : 'notification',
    group: '最新动态',
    mentioned: Boolean(comment?.body.toLowerCase().includes(`@${login.toLowerCase()}`)),
    changeType: recentComment || recentReview ? 'comment' : pull ? 'commit' : 'attention',
  };
}
