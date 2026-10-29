import { GitHubMarkdown } from '../../components/GitHubMarkdown';
import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { shortTime, type GitHubGateway, type IssueDetail } from '../../core/github';
import type { Activity } from './model';

export function IssuePreview({
  record,
  repo,
  accountId,
  gateway,
  onClose,
  onRead,
  isRead,
  onSnooze,
}: {
  record: Activity;
  repo: string;
  accountId: number;
  gateway: GitHubGateway;
  onClose: () => void;
  onRead: () => void;
  isRead: boolean;
  onSnooze: () => void;
}) {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    gateway
      .request<IssueDetail>('issue', repo, accountId, record.number)
      .then((result) => {
        if (active) {
          setDetail(result.payload);
          setError(result.error ?? '');
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [gateway, repo, accountId, record.number]);
  return (
    <Modal title={`Issue #${record.number}`} onClose={onClose}>
      <h2>{record.title}</h2>
      {error && (
        <p role="alert" className="yellow">
          {error}
        </p>
      )}
      {!detail && !error && <p role="status">正在读取 Issue…</p>}
      {detail && (
        <>
          <p className="dim">{detail.issue.user?.login ?? '已删除用户'}</p>
          <GitHubMarkdown>{detail.issue.body || '暂无说明'}</GitHubMarkdown>
          {detail.comments.flat().map((comment) => (
            <article key={comment.id} className="detail-card">
              <h3>
                {comment.user?.login ?? '已删除用户'} · {shortTime(comment.created_at)}
              </h3>
              <GitHubMarkdown>{comment.body}</GitHubMarkdown>
            </article>
          ))}
        </>
      )}
      <div className="inline-group">
        <button className="chip" onClick={onRead}>
          {isRead ? '标记未读' : '标记已读'}
        </button>
        <button className="chip" onClick={onSnooze}>
          稍后处理
        </button>
        <button
          className="chip accent"
          onClick={() => {
            if (record.url)
              void gateway.open(record.url).catch((reason) => setError(String(reason)));
          }}
        >
          在 GitHub 中查看 ↗
        </button>
      </div>
    </Modal>
  );
}
