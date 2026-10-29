import { useId, useMemo, useState, type ReactNode } from 'react';
import { TabList, TabPanel } from '../../components/Tabs';
import { PullLifecycleIcon } from '../../components/PullLifecycleIcon';
import { PullStatusBadges } from '../../components/PullStatusBadges';
import { CodeDiff } from '../../components/CodeDiff';
import { describeChecks } from '../../core/checks';
import { describePull } from '../../core/pull-status';
import { GitHubMarkdown } from '../../components/GitHubMarkdown';
import type { PullRequest } from './model';
import { shortTime, type GitHubGateway, type PullDetail } from '../../core/github';
import {
  invalidateRecord,
  useGitHubResource,
  type ResourceCache,
} from '../../lib/useGitHubResource';

type Overview = Pick<PullDetail, 'pull'>;
type Discussion = Pick<PullDetail, 'comments' | 'reviews' | 'reviewComments'>;
type Files = Pick<PullDetail, 'files'>;
type Checks = Pick<PullDetail, 'checks' | 'statuses' | 'checkError'>;
type ResourceProps = {
  gateway: GitHubGateway;
  cache: ResourceCache;
  repo: string;
  account: number;
  number: number;
  head: string;
  ready: boolean;
  minFetchedAt: number;
};
const reviewLabels: Record<string, string> = {
  APPROVED: '已批准',
  CHANGES_REQUESTED: '要求变更',
  COMMENTED: '评论评审',
  DISMISSED: '已撤销',
  PENDING: '待提交',
};

function ResourceState({
  loading,
  error,
  cached,
  retry,
  onReload,
  children,
}: {
  loading: boolean;
  error: string;
  cached: boolean;
  retry: () => void;
  onReload: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      {loading && (
        <p role="status" className="resource-status">
          {cached ? '正在更新，先显示上次读取的内容…' : '正在读取内容…'}
        </p>
      )}
      {error && (
        <div className="sync-error-banner" role="alert">
          <p>{error}</p>
          {cached && <p>保留上次读取内容，可能不是最新。</p>}
          <button
            className="chip"
            disabled={loading}
            onClick={/GH_HEAD_CHANGED/.test(error) ? onReload : retry}
          >
            {/GH_HEAD_CHANGED/.test(error) ? '刷新详情' : '重试'}
          </button>
        </div>
      )}
      {children}
    </>
  );
}
function DiscussionSection({
  resource,
  onReload,
}: {
  resource: ResourceProps;
  onReload: () => void;
}) {
  const result = useGitHubResource<Discussion>(
    resource.gateway,
    resource.cache,
    'discussion',
    resource.repo,
    resource.account,
    resource.number,
    resource.head,
    resource.ready,
    resource.minFetchedAt,
  );
  const [limit, setLimit] = useState(30);
  const timeline = useMemo(() => {
    const data = result.response?.payload;
    return data
      ? [
          ...data.comments.flat().map((c) => ({
            id: `comment-${c.id}`,
            author: c.user?.login,
            body: c.body,
            date: c.created_at,
            label: '普通评论',
            version: '',
          })),
          ...data.reviewComments.flat().map((c) => ({
            id: `inline-${c.id}`,
            author: c.user?.login,
            body: c.body,
            date: c.created_at,
            label: `代码评论 · ${c.path}`,
            version: '',
          })),
          ...data.reviews.flat().map((r) => ({
            id: `review-${r.id}`,
            author: r.user?.login,
            body: r.body,
            date: r.submitted_at ?? '',
            label: `${reviewLabels[r.state] ?? r.state} · 正式评审`,
            version: `评审版本 ${r.commit_id.slice(0, 7)} · 当前 HEAD ${resource.head.slice(0, 7)}${r.commit_id !== resource.head ? ' · 代码版本已变化' : ''}`,
          })),
        ].sort((a, b) => a.date.localeCompare(b.date))
      : [];
  }, [result.response, resource.head]);
  const reviews = result.response?.payload.reviews.flat() ?? [];
  const latestReviews = [
    ...new Map(
      reviews
        .filter((review) => review.state !== 'COMMENTED' && review.state !== 'PENDING')
        .map((review) => [review.user?.login ?? String(review.id), review]),
    ).values(),
  ];
  return (
    <ResourceState {...result} cached={Boolean(result.response)} onReload={onReload}>
      {result.response && (
        <>
          <section className="detail-card" aria-label="评审结论">
            <h2>评审</h2>
            {latestReviews.length ? (
              latestReviews.map((review) => (
                <p key={review.id}>
                  {review.user?.login ?? '已删除用户'} ·{' '}
                  {reviewLabels[review.state] ?? review.state}
                  <br />
                  <small>
                    {review.commit_id === resource.head
                      ? '评审与 HEAD 一致'
                      : `评审版本 ${review.commit_id.slice(0, 7)} · 代码已更新`}
                  </small>
                </p>
              ))
            ) : (
              <p>暂无正式结论</p>
            )}
          </section>
          <h2 className="section-count">讨论 {timeline.length}</h2>
          {timeline.length > limit && (
            <button className="chip" onClick={() => setLimit((n) => n + 30)}>
              显示更早的讨论（还有 {timeline.length - limit} 条）
            </button>
          )}
          {timeline.slice(-limit).map((event) => (
            <article
              className={`detail-card ${event.version ? 'formal-review' : ''}`}
              key={event.id}
            >
              <div className="inline-group">
                <h2>{event.author ?? '已删除用户'}</h2>
                <span className="muted">{event.label}</span>
                <time className="dim">{event.date && shortTime(event.date)}</time>
              </div>
              <GitHubMarkdown>{event.body || '无正文'}</GitHubMarkdown>
              {event.version && <small>{event.version}</small>}
            </article>
          ))}
          {!timeline.length && <p className="resource-status">暂无讨论。</p>}
          <p className="footnote">回复、提交评审请前往 GitHub。</p>
        </>
      )}
    </ResourceState>
  );
}
function FilePatch({ file }: { file: Files['files'][number][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="file-record">
        <code>{file.filename}</code>
        <span className="change-stats">
          <span className="green">+{file.additions}</span>
          <span className="danger">−{file.deletions}</span>
        </span>
      </summary>
      {expanded &&
        (file.patch ? (
          <CodeDiff patch={file.patch} filename={file.filename} />
        ) : (
          <p className="resource-status">GitHub 未提供此文件的文本差异，请前往 GitHub 查看。</p>
        ))}
    </details>
  );
}
function FilesSection({
  resource,
  count,
  onReload,
}: {
  resource: ResourceProps;
  count: number;
  onReload: () => void;
}) {
  const result = useGitHubResource<Files>(
    resource.gateway,
    resource.cache,
    'files',
    resource.repo,
    resource.account,
    resource.number,
    resource.head,
    resource.ready,
    resource.minFetchedAt,
  );
  const files = result.response?.payload.files.flat() ?? [];
  const [limit, setLimit] = useState(100);
  return (
    <ResourceState {...result} cached={Boolean(result.response)} onReload={onReload}>
      {result.response && (
        <article className="detail-card">
          <h2>文件变更 {count}</h2>
          {files.slice(0, limit).map((file) => (
            <FilePatch key={file.filename} file={file} />
          ))}
          {files.length > limit && (
            <button className="chip" onClick={() => setLimit((n) => n + 100)}>
              显示更多文件（还有 {files.length - limit} 个）
            </button>
          )}
          {files.length < count && (
            <p className="yellow">
              GitHub 文件列表未完整返回，已加载 {files.length} / {count} 个文件。请在 GitHub
              查看完整变更。
            </p>
          )}
          {!count && <p>没有文件变更。</p>}
        </article>
      )}
    </ResourceState>
  );
}
function ChecksSection({ resource, onReload }: { resource: ResourceProps; onReload: () => void }) {
  const result = useGitHubResource<Checks>(
    resource.gateway,
    resource.cache,
    'checks',
    resource.repo,
    resource.account,
    resource.number,
    resource.head,
    resource.ready,
    resource.minFetchedAt,
  );
  const checks = result.response?.payload.checks?.flatMap((page) => page.check_runs) ?? [];
  const statuses = [
    ...new Map(
      (result.response?.payload.statuses?.flatMap((page) => page.statuses) ?? []).map((status) => [
        status.context,
        status,
      ]),
    ).values(),
  ];
  const { rows, counts } = describeChecks(checks, statuses);
  return (
    <ResourceState {...result} cached={Boolean(result.response)} onReload={onReload}>
      {result.response && (
        <article className="detail-card">
          <h2>检查 {checks.length + statuses.length}</h2>
          <p className="check-summary">
            <span className="danger">{counts.failed} 失败</span>
            <span>{counts.pending} 进行中</span>
            <span className="green">{counts.passed} 通过</span>
            <span>{counts.other} 跳过或其他</span>
          </p>
          {result.response.payload.checkError && (
            <p role="alert" className="yellow">
              {result.response.payload.checkError} · 未能完整获取检查结果
            </p>
          )}
          <div className="check-list">
            {rows.map((row) => (
              <div className={`check-row check-${row.kind}`} key={row.key}>
                <span className="check-indicator" aria-hidden="true">
                  {row.kind === 'passed' ? '✓' : row.kind === 'failed' ? '!' : '·'}
                </span>
                <span className="check-name">{row.name}</span>
                <span className="check-result">{row.label}</span>
              </div>
            ))}
          </div>
          {!checks.length && !statuses.length && !result.response.payload.checkError && (
            <p>当前 HEAD 没有检查记录。</p>
          )}
        </article>
      )}
    </ResourceState>
  );
}
export function PullDetailPage({
  pull,
  onBack,
  repo,
  accountId,
  gateway,
  cache,
}: {
  pull: PullRequest;
  onBack: () => void;
  repo: string;
  accountId: number;
  gateway: GitHubGateway;
  cache: ResourceCache;
}) {
  const minFetchedAt = Date.parse(pull.updatedAt ?? '') || 0;
  const result = useGitHubResource<Overview>(
    gateway,
    cache,
    'pull',
    repo,
    accountId,
    pull.number,
    '',
    true,
    minFetchedAt,
    pull.headSha,
  );
  const [tab, setTab] = useState('discussion');
  const tabsId = useId();
  const [generation, setGeneration] = useState(0);
  const [openError, setOpenError] = useState('');
  const detail = result.response?.payload.pull;
  const presentation = detail
    ? describePull({
        state: detail.merged ? 'merged' : detail.state,
        isDraft: detail.draft,
        reviewDecision: detail.reviewDecision,
        mergeStateStatus: detail.mergeStateStatus,
        mergeable: detail.mergeable,
        checkState: detail.checkState,
      })
    : pull.presentation;
  const resource = {
    gateway,
    cache,
    repo,
    account: accountId,
    number: pull.number,
    head: detail?.head.sha ?? '',
    ready: Boolean(
      detail && (!pull.headSha || detail.head.sha === pull.headSha || result.liveValidated),
    ),
    minFetchedAt,
  };
  function refresh() {
    invalidateRecord(cache, accountId, repo, pull.number);
    setGeneration((n) => n + 1);
    result.retry();
  }
  return (
    <>
      <header className="location detail-location">
        <button className="chip" onClick={onBack}>
          ← 返回列表
        </button>

        <span className="muted">PR #{pull.number}</span>
      </header>
      <section className="pr-summary">
        <div className="pr-title-row">
          {presentation && <PullLifecycleIcon status={presentation} />}
          <h1>{detail?.title ?? pull.title}</h1>
        </div>
        <div className="inline-group">
          <span className="chip accent">#{pull.number}</span>
          {detail && (
            <span className="muted">
              作者：{detail.user?.login ?? '已删除用户'} · {detail.commits} 个提交
            </span>
          )}
        </div>
        {presentation && (
          <>
            <PullStatusBadges status={presentation} />
            <p className="pull-next-action">下一步：{presentation.nextAction}</p>
          </>
        )}
        <div className="inline-group branch-summary">
          {detail && (
            <>
              <span className="dim">
                {detail.head.ref} → {detail.base.ref}
              </span>
              <span className="change-stats">
                <span className="green">+{detail.additions}</span>
                <span className="danger">−{detail.deletions}</span>
                <span>{detail.changed_files} 个文件</span>
              </span>
              <span className="dim" title="当前提交">
                HEAD {detail.head.sha.slice(0, 7)}
              </span>
            </>
          )}
          <button className="chip" disabled={result.loading} onClick={refresh}>
            刷新详情
          </button>
          <button
            className="chip accent"
            onClick={() =>
              void gateway
                .open(
                  detail?.html_url ?? pull.url ?? `https://github.com/${repo}/pull/${pull.number}`,
                )
                .catch((reason) => setOpenError(String(reason)))
            }
          >
            在 GitHub 中查看 ↗
          </button>
        </div>
      </section>
      {openError && <p role="alert">{openError}</p>}
      <ResourceState {...result} cached={Boolean(detail)} onReload={refresh} />
      <TabList
        id={tabsId}
        label="PR 详情"
        value={tab}
        onChange={setTab}
        activation="manual"
        className="detail-tabs"
        tabClassName="chip"
        items={[
          { value: 'discussion', label: '讨论' },
          { value: 'files', label: `文件变更${detail ? ` ${detail.changed_files}` : ''}` },
          { value: 'checks', label: '检查' },
        ]}
      />
      <div className="detail-columns">
        <TabPanel
          id={tabsId}
          value={tab}
          className="detail-timeline"
          key={`${detail?.head.sha ?? ''}:${generation}:${tab}`}
        >
          {detail && (
            <>
              {tab === 'discussion' ? (
                <>
                  <article className="detail-card">
                    <h2>说明</h2>
                    <GitHubMarkdown>{detail.body || '暂无说明'}</GitHubMarkdown>
                  </article>
                  <DiscussionSection resource={resource} onReload={refresh} />
                </>
              ) : tab === 'files' ? (
                <FilesSection resource={resource} count={detail.changed_files} onReload={refresh} />
              ) : (
                <ChecksSection resource={resource} onReload={refresh} />
              )}
            </>
          )}
        </TabPanel>
      </div>
      {result.response && (
        <footer className="page-note">
          详情读取 · {shortTime(new Date(result.response.fetchedAt).toISOString())}
          {result.loading
            ? ' · 上次读取，正在验证更新'
            : result.response.stale
              ? ' · 缓存，可能不是最新'
              : ''}
        </footer>
      )}
    </>
  );
}
