import { useI18n } from '../../i18n/I18n';
import { GitHubMarkdown } from '../../components/GitHubMarkdown';
import { useState } from 'react';
import { useGitHubResource, type ResourceCache } from '../../lib/useGitHubResource';
import { Modal } from '../../components/Modal';
import { shortTime, type GitHubGateway, type IssueDetail } from '../../core/github';
import type { Activity } from './model';

export function IssuePreview({
  record,
  cache,
  repo,
  accountId,
  gateway,
  onClose,
  onRead,
  isRead,
  onSnooze,
}: {
  record: Activity;
  cache: ResourceCache;
  repo: string;
  accountId: number;
  gateway: GitHubGateway;
  onClose: () => void;
  onRead: () => void;
  isRead: boolean;
  onSnooze: () => void;
}) {
  const { t, locale } = useI18n();

  const result = useGitHubResource<IssueDetail>(
    gateway,
    cache,
    'issue',
    repo,
    accountId,
    record.number,
    '',
    true,
    Date.parse(record.updatedAt ?? '') || 0,
  );
  const detail = result.response?.payload;
  const [openError, setOpenError] = useState('');
  const error = result.error || openError;
  const [limit, setLimit] = useState(30);
  const comments = detail?.comments.flat() ?? [];
  return (
    <Modal className="issue-reader" title={`Issue #${record.number}`} onClose={onClose}>
      <h2 className="issue-reader-title">{record.title}</h2>
      <div className="issue-reader-body" tabIndex={0} aria-label={t('Issue 内容')}>
        {error && (
          <p role="alert" className="yellow">
            {t(error)}
          </p>
        )}
        {result.loading && (
          <p role="status">
            {detail ? t('正在更新，先显示上次读取的内容…') : t('正在读取 Issue…')}
          </p>
        )}
        {result.error && (
          <button className="chip" disabled={result.loading} onClick={result.retry}>
            {t('重试读取 Issue')}
          </button>
        )}
        {result.response && (
          <p className="dim">
            {t('上次读取')}
            {new Date(result.response.fetchedAt).toLocaleString(locale)}
            {result.response.stale ? t(' · 缓存，可能不是最新') : ''}
          </p>
        )}
        {detail && (
          <>
            <p className="dim">{detail.issue.user?.login ?? '已删除用户'}</p>
            <GitHubMarkdown repo={repo}>{detail.issue.body || '暂无说明'}</GitHubMarkdown>
            <section className="detail-card" aria-label={t('关联 PR')}>
              <h3>{t('关联 PR')}</h3>
              <p className="dim">
                {t('引用此 Issue 的 PR；引用不一定表示合并后会自动关闭 Issue。')}
              </p>
              {detail.referencedPulls?.map((pull) => (
                <p key={pull.url}>
                  <button
                    className="text-button accent"
                    onClick={() =>
                      void gateway.open(pull.url).catch((reason) => setOpenError(String(reason)))
                    }
                  >
                    #{pull.number} {pull.title} ↗
                  </button>
                  {' · '}
                  {pull.merged ? t('已合并') : pull.state === 'closed' ? t('已关闭') : t('开放')}
                </p>
              ))}
              {detail.referencedPulls?.length === 0 && (
                <p className="dim">{t('未找到引用此 Issue 的 PR。')}</p>
              )}
              {!detail.referencedPulls && (
                <button className="chip" disabled={result.loading} onClick={result.retry}>
                  {t('读取关联 PR')}
                </button>
              )}
            </section>
            {comments.length > limit && (
              <button className="chip" onClick={() => setLimit((n) => n + 30)}>
                {t('显示更早的评论（还有')}
                {comments.length - limit} {t('条）')}
              </button>
            )}
            {comments.slice(-limit).map((comment) => (
              <article key={comment.id} className="detail-card">
                <div className="comment-heading">
                  <h3>{comment.user?.login ?? '已删除用户'}</h3>
                  <time>{shortTime(comment.created_at)}</time>
                </div>
                <GitHubMarkdown repo={repo}>{comment.body}</GitHubMarkdown>
              </article>
            ))}
          </>
        )}
      </div>
      <div className="inline-group modal-actions">
        <button className="chip" onClick={onRead}>
          {isRead ? t('标记未读') : t('标记已读')}
        </button>
        <button className="chip" onClick={onSnooze}>
          {t('稍后处理')}
        </button>
        <button
          className="chip accent"
          onClick={() => {
            if (record.url)
              void gateway.open(record.url).catch((reason) => setOpenError(String(reason)));
          }}
        >
          {t('在 GitHub 中查看 ↗')}
        </button>
      </div>
    </Modal>
  );
}
