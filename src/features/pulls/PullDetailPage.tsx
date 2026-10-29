import { GitHubMarkdown } from '../../components/GitHubMarkdown';
import { useEffect, useState } from 'react';
import type { PullRequest } from './model';
import {
  shortTime,
  type GitHubGateway,
  type PullDetail,
  type GitHubResponse,
} from '../../core/github';

const reviewLabels: Record<string, string> = {
  APPROVED: '批准',
  CHANGES_REQUESTED: '请求修改',
  COMMENTED: '评论评审',
  DISMISSED: '已撤销',
  PENDING: '待提交',
};
export function PullDetailPage({
  pull,
  onBack,
  repo,
  accountId,
  gateway,
}: {
  pull: PullRequest;
  onBack: () => void;
  repo: string;
  accountId: number;
  gateway: GitHubGateway;
}) {
  const [tab, setTab] = useState('discussion');
  const [response, setResponse] = useState<GitHubResponse<PullDetail> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    gateway
      .request<PullDetail>('detail', repo, accountId, pull.number)
      .then((result) => {
        if (active) {
          setResponse(result);
          setError(result.error ?? '');
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [gateway, repo, accountId, pull.number, retry]);
  const detail = response?.payload;
  const reviews = detail?.reviews.flat() ?? [];
  const files = detail?.files.flat() ?? [];
  const checks = detail?.checks?.flatMap((page) => page.check_runs) ?? [];
  const statuses = [
    ...new Map(
      (detail?.statuses?.flatMap((page) => page.statuses) ?? []).map((s) => [s.context, s]),
    ).values(),
  ];
  const timeline = detail
    ? [
        ...detail.comments.flat().map((c) => ({
          id: `comment-${c.id}`,
          author: c.user?.login,
          body: c.body,
          date: c.created_at,
          label: '普通评论',
          version: '',
        })),
        ...detail.reviewComments.flat().map((c) => ({
          id: `inline-${c.id}`,
          author: c.user?.login,
          body: c.body,
          date: c.created_at,
          label: `代码评论 · ${c.path}`,
          version: '',
        })),
        ...reviews.map((r) => ({
          id: `review-${r.id}`,
          author: r.user?.login,
          body: r.body,
          date: r.submitted_at ?? '',
          label: `${reviewLabels[r.state] ?? r.state} · 正式评审`,
          version: `评审版本 ${r.commit_id.slice(0, 7)} · 当前 HEAD ${detail.pull.head.sha.slice(0, 7)}${r.commit_id !== detail.pull.head.sha ? ' · 代码版本已变化' : ''}`,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const latestReviews = [
    ...new Map(
      reviews
        .filter((r) => r.state !== 'COMMENTED' && r.state !== 'PENDING')
        .map((r) => [r.user?.login ?? String(r.id), r]),
    ).values(),
  ];
  function open() {
    void gateway
      .open(detail?.pull.html_url ?? pull.url ?? `https://github.com/${repo}/pull/${pull.number}`)
      .catch((reason) => setError(String(reason)));
  }
  return (
    <>
      <header className="location">
        <button className="breadcrumb-button" onClick={onBack}>
          {repo}
        </button>
        <span className="separator">/</span>
        <span className="muted">PR #{pull.number}</span>
        <span className="connection-badge">GitHub</span>
      </header>
      <section className="pr-summary">
        <h1>{detail?.pull.title ?? pull.title}</h1>
        <div className="inline-group">
          <span className="chip accent">#{pull.number}</span>
          <span className="chip green">
            {detail
              ? detail.pull.merged
                ? '已合并'
                : detail.pull.draft
                  ? '草稿'
                  : detail.pull.state === 'open'
                    ? '开放'
                    : '已关闭'
              : pull.status}
          </span>
          <span className="muted">
            {detail &&
              `作者：${detail.pull.user?.login ?? '已删除用户'} · ${repo} · ${detail.pull.commits} 个提交`}
          </span>
        </div>
        <div className="inline-group branch-summary">
          {detail && (
            <>
              <span className="dim">
                {detail.pull.head.ref} → {detail.pull.base.ref}
              </span>
              <span className="green">
                +{detail.pull.additions} −{detail.pull.deletions} · {detail.pull.changed_files}{' '}
                个文件
              </span>
            </>
          )}
          <button className="chip accent" onClick={open}>
            在 GitHub 中查看 ↗
          </button>
        </div>
      </section>
      {error && (
        <div className="sync-error-banner" role="alert">
          <p>{error}</p>
          {response && (
            <p>
              保留上次读取记录 · {shortTime(new Date(response.fetchedAt).toISOString())} ·
              可能不是最新
            </p>
          )}
          <button
            className="chip"
            onClick={() => {
              setError('');
              setRetry((n) => n + 1);
            }}
          >
            重试
          </button>
        </div>
      )}
      {!detail && !error && (
        <p role="status" className="list-empty">
          正在读取 PR 详情…
        </p>
      )}
      {detail && (
        <>
          <div className="detail-tabs" role="tablist" aria-label="PR 详情">
            {[
              ['discussion', `讨论 ${timeline.length}`],
              ['files', `文件变更 ${detail.pull.changed_files}`],
              ['checks', `检查 ${checks.length + statuses.length}`],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`chip ${tab === id ? 'active' : ''}`}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="detail-columns">
            <section className="detail-timeline">
              {tab === 'discussion' ? (
                <>
                  <article className="detail-card">
                    <h2>说明</h2>
                    <GitHubMarkdown>{detail.pull.body || '暂无说明'}</GitHubMarkdown>
                  </article>
                  {timeline.map((event) => (
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
                  <p className="footnote">回复、提交评审请前往 GitHub。</p>
                </>
              ) : tab === 'files' ? (
                <article className="detail-card">
                  <h2>文件变更</h2>
                  {files.map((file) => (
                    <details key={file.filename}>
                      <summary className="file-record">
                        <code>{file.filename}</code>
                        <span className="green">
                          +{file.additions} −{file.deletions}
                        </span>
                      </summary>
                      <pre className="github-patch">
                        {file.patch ?? 'GitHub 未提供此文件的文本差异，请前往 GitHub 查看。'}
                      </pre>
                    </details>
                  ))}
                  {files.length < detail.pull.changed_files && (
                    <p className="yellow">
                      GitHub 文件列表未完整返回，已加载 {files.length} / {detail.pull.changed_files}{' '}
                      个文件。请在 GitHub 查看完整变更。
                    </p>
                  )}
                </article>
              ) : (
                <article className="detail-card">
                  <h2>检查</h2>
                  {detail.checkError && (
                    <p role="alert" className="yellow">
                      {detail.checkError} · 未能完整获取检查结果
                    </p>
                  )}
                  {checks.map((check) => (
                    <div className="file-record" key={check.id}>
                      <span>{check.name}</span>
                      <span className={check.conclusion === 'success' ? 'green' : 'muted'}>
                        {check.conclusion ?? check.status}
                      </span>
                    </div>
                  ))}
                  {statuses.map((status) => (
                    <div className="file-record" key={status.context}>
                      <span>{status.context}</span>
                      <span>{status.state}</span>
                    </div>
                  ))}
                  {!checks.length && !statuses.length && !detail.checkError && (
                    <p>当前 HEAD 没有检查记录。</p>
                  )}
                </article>
              )}
            </section>
            <aside className="detail-aside">
              <section className="detail-card">
                <h2>评审</h2>
                {latestReviews.length ? (
                  latestReviews.map((review) => (
                    <p key={review.id}>
                      {review.user?.login ?? '已删除用户'} ·{' '}
                      {reviewLabels[review.state] ?? review.state}
                      <br />
                      <small>
                        {review.commit_id === detail.pull.head.sha
                          ? '评审与 HEAD 一致'
                          : `评审版本 ${review.commit_id.slice(0, 7)} · 代码已更新`}
                      </small>
                    </p>
                  ))
                ) : (
                  <p>暂无正式结论</p>
                )}
                <small>当前 HEAD {detail.pull.head.sha.slice(0, 7)}</small>
              </section>
              <section className="detail-card">
                <h2>检查</h2>
                <p>
                  {detail.checkError
                    ? '检查结果不完整'
                    : `${checks.length + statuses.length} 个检查 / 状态`}
                </p>
                <p>
                  {checks.filter((c) => c.conclusion === 'success').length +
                    statuses.filter((s) => s.state === 'success').length}{' '}
                  个通过
                </p>
              </section>
              <section className="detail-card">
                <h2>文件变更</h2>
                <p className="file-list">{files.map((f) => f.filename).join('\n')}</p>
                <p className="green">
                  +{detail.pull.additions} −{detail.pull.deletions} · {detail.pull.changed_files}{' '}
                  个文件
                </p>
              </section>
            </aside>
          </div>
          <footer className="page-note">
            GitHub 数据 · {shortTime(new Date(response.fetchedAt).toISOString())}
            {response.stale ? ' · 缓存，可能不是最新' : ''}
          </footer>
        </>
      )}
    </>
  );
}
