import { reviewThreads } from './reviewThreads';
import { useI18n } from '../../i18n/I18n';
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
  const { t } = useI18n();

  return (
    <>
      {loading && (
        <p role="status" className="resource-status">
          {cached ? t('正在更新，先显示上次读取的内容…') : t('正在读取内容…')}
        </p>
      )}
      {error && (
        <div className="sync-error-banner" role="alert">
          <p>{t(error)}</p>
          {cached && <p>{t('保留上次读取内容，可能不是最新。')}</p>}
          <button
            className="chip"
            disabled={loading}
            onClick={/GH_HEAD_CHANGED/.test(error) ? onReload : retry}
          >
            {/GH_HEAD_CHANGED/.test(error) ? t('刷新详情') : t('重试')}
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
  const { t } = useI18n();

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
            replies: [],
            replyTo: undefined,
          })),
          ...reviewThreads(data.reviewComments.flat()).map(({ comment: c, replies }) => ({
            id: `inline-${c.id}`,
            author: c.user?.login,
            body: c.body,
            date: c.created_at,
            label: t('代码评论 · {0}', [c.path ?? '']),
            version: '',
            replies,
            replyTo: c.in_reply_to_id,
          })),
          ...data.reviews
            .flat()
            .filter((r) => r.state !== 'PENDING' && (r.state !== 'COMMENTED' || r.body.trim()))
            .map((r) => ({
              id: `review-${r.id}`,
              replies: [],
              replyTo: undefined,
              author: r.user?.login,
              body: r.body,
              date: r.submitted_at ?? '',
              label: t('{0} · 正式评审', [t(reviewLabels[r.state] ?? r.state)]),
              version: t('评审版本 {0} · 当前 HEAD {1}{2}', [
                r.commit_id.slice(0, 7),
                resource.head.slice(0, 7),
                r.commit_id !== resource.head ? t(' · 代码版本已变化') : '',
              ]),
            })),
        ].sort((a, b) =>
          (a.replies.at(-1)?.created_at ?? a.date).localeCompare(
            b.replies.at(-1)?.created_at ?? b.date,
          ),
        )
      : [];
  }, [result.response, resource.head, t]);
  const reviews = result.response?.payload.reviews.flat() ?? [];
  const latestReviews = [
    ...new Map(
      reviews
        .filter((review) => review.state !== 'COMMENTED' && review.state !== 'PENDING')
        .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
        .map((review) => [review.user?.login ?? String(review.id), review]),
    ).values(),
  ];
  return (
    <ResourceState {...result} cached={Boolean(result.response)} onReload={onReload}>
      {result.response && (
        <>
          <section className="detail-card review-summary" aria-label={t('评审结论')}>
            <h2>{t('评审结论')}</h2>
            {latestReviews.length ? (
              <ul className="review-decisions">
                {latestReviews.map((review) => (
                  <li key={review.id} className="review-decision">
                    <span className="reviewer-initial" aria-hidden="true">
                      {review.user?.login?.slice(0, 1).toUpperCase() ?? '?'}
                    </span>
                    <div className="reviewer-info">
                      <strong>{review.user?.login ?? t('已删除用户')}</strong>
                      <span
                        className={`review-version ${review.commit_id !== resource.head ? 'review-version-old' : ''}`}
                        title={
                          review.commit_id === resource.head
                            ? t('针对当前代码提交的评审')
                            : t('评审后代码已有更新，此结论针对旧版本 {0}', [
                                review.commit_id.slice(0, 7),
                              ])
                        }
                      >
                        {review.commit_id === resource.head
                          ? t('当前版本')
                          : t('旧版本 {0}', [review.commit_id.slice(0, 7)])}
                      </span>
                    </div>
                    <div className="review-decision-result">
                      <span
                        className={`status-badge ${review.state === 'APPROVED' ? 'status-success' : review.state === 'CHANGES_REQUESTED' ? 'status-warning' : 'status-neutral'}`}
                      >
                        <span aria-hidden="true">
                          {review.state === 'APPROVED'
                            ? '✓'
                            : review.state === 'CHANGES_REQUESTED'
                              ? '!'
                              : '−'}
                        </span>
                        {t(reviewLabels[review.state] ?? review.state)}
                      </span>
                      {review.submitted_at && <time>{shortTime(review.submitted_at)}</time>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('暂无正式结论')}</p>
            )}
          </section>
          <h2 className="section-count">
            {t('讨论')} {timeline.reduce((count, event) => count + 1 + event.replies.length, 0)}
          </h2>
          {timeline.length > limit && (
            <button className="chip" onClick={() => setLimit((n) => n + 30)}>
              {t('显示更早的讨论（还有 {0} 条）', [timeline.length - limit])}
            </button>
          )}
          {timeline.slice(-limit).map((event) => (
            <article
              className={`detail-card ${event.version ? 'formal-review' : ''}`}
              key={event.id}
            >
              <div className="inline-group">
                <h2>{event.author ?? '已删除用户'}</h2>
                <span className="muted">{t(event.label)}</span>
                <time className="dim">{event.date && shortTime(event.date)}</time>
              </div>
              {event.replyTo != null && <p className="reply-context">{t('回复较早的评论')}</p>}
              {event.body.trim() && (
                <GitHubMarkdown repo={resource.repo}>{event.body}</GitHubMarkdown>
              )}
              {event.version && <small>{event.version}</small>}
              {event.replies.length > 0 && (
                <div className="review-replies" role="group" aria-label={t('代码评论回复')}>
                  {event.replies.map((reply) => {
                    const parent = event.replies.find((item) => item.id === reply.in_reply_to_id);
                    const author = (parent ? parent.user?.login : event.author) ?? t('已删除用户');
                    return (
                      <article className="review-reply" key={reply.id}>
                        <div className="inline-group">
                          <h3>{reply.user?.login ?? t('已删除用户')}</h3>
                          <span className="reply-context">{t('回复 @{0}', [author])}</span>
                          <time className="dim">{shortTime(reply.created_at)}</time>
                        </div>
                        <GitHubMarkdown repo={resource.repo}>{reply.body}</GitHubMarkdown>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
          {!timeline.length && <p className="resource-status">{t('暂无讨论。')}</p>}
        </>
      )}
    </ResourceState>
  );
}
function FilePatch({ file }: { file: Files['files'][number][number] }) {
  const { t } = useI18n();

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
          <p className="resource-status">
            {t('GitHub 未提供此文件的文本差异，请前往 GitHub 查看。')}
          </p>
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
  const { t } = useI18n();

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
          <h2>
            {t('文件变更')}
            {count}
          </h2>
          {files.slice(0, limit).map((file) => (
            <FilePatch key={file.filename} file={file} />
          ))}
          {files.length > limit && (
            <button className="chip" onClick={() => setLimit((n) => n + 100)}>
              {t('显示更多文件（还有')}
              {files.length - limit} {t('个）')}
            </button>
          )}
          {files.length < count && (
            <p className="yellow">
              {t('GitHub 文件列表未完整返回，已加载')}
              {files.length} / {count} {t('个文件。请在 GitHub 查看完整变更。')}
            </p>
          )}
          {!count && <p>{t('没有文件变更。')}</p>}
        </article>
      )}
    </ResourceState>
  );
}
function ChecksSection({ resource, onReload }: { resource: ResourceProps; onReload: () => void }) {
  const { t } = useI18n();

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
          <h2>
            {t('检查')}
            {checks.length + statuses.length}
          </h2>
          <p className="check-summary">
            <span className="danger">
              {counts.failed} {t('失败')}
            </span>
            <span>
              {counts.pending} {t('进行中')}
            </span>
            <span className="green">
              {counts.passed} {t('通过')}
            </span>
            <span>
              {counts.other} {t('跳过或其他')}
            </span>
          </p>
          {result.response.payload.checkError && (
            <p role="alert" className="yellow">
              {result.response.payload.checkError} {t('· 未能完整获取检查结果')}
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
            <p>{t('当前 HEAD 没有检查记录。')}</p>
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
  const { t } = useI18n();

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
          {t('← 返回列表')}
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
              {t('作者：')}
              {detail.user?.login ?? '已删除用户'} · {detail.commits} {t('个提交')}
            </span>
          )}
        </div>
        {presentation && (
          <>
            <PullStatusBadges status={presentation} />
            <p className="pull-next-action">
              {t('建议：')}
              {t(presentation.nextAction)}
            </p>
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
                <span>
                  {detail.changed_files} {t('个文件')}
                </span>
              </span>
              <span className="dim" title={t('当前提交')}>
                HEAD {detail.head.sha.slice(0, 7)}
              </span>
            </>
          )}
          <button className="chip" disabled={result.loading} onClick={refresh}>
            {t('刷新详情')}
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
            {t('在 GitHub 中查看 ↗')}
          </button>
        </div>
      </section>
      {openError && <p role="alert">{t(openError)}</p>}
      <ResourceState {...result} cached={Boolean(detail)} onReload={refresh} />
      <TabList
        id={tabsId}
        label={t('PR 详情')}
        value={tab}
        onChange={setTab}
        activation="manual"
        className="detail-tabs"
        tabClassName="chip"
        items={[
          { value: 'discussion', label: '讨论' },
          { value: 'files', label: t('文件变更{0}', [detail ? ` ${detail.changed_files}` : '']) },
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
                    <h2>{t('说明')}</h2>
                    <GitHubMarkdown repo={repo}>{detail.body || '暂无说明'}</GitHubMarkdown>
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
          {t('详情读取 ·')}
          {shortTime(new Date(result.response.fetchedAt).toISOString())}
          {result.loading
            ? t(' · 上次读取，正在验证更新')
            : result.response.stale
              ? t(' · 缓存，可能不是最新')
              : ''}
        </footer>
      )}
    </>
  );
}
