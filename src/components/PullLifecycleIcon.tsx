import { useI18n } from '../i18n/I18n';
import type { PullStatus } from '../core/pull-status';
import './pull-lifecycle-icon.css';

type Lifecycle = Pick<PullStatus, 'state' | 'draft'>;
export function PullLifecycleIcon({ status }: { status: Lifecycle }) {
  const { t } = useI18n();

  const kind =
    status.state === 'merged'
      ? 'merged'
      : status.state === 'closed'
        ? 'closed'
        : status.draft
          ? 'draft'
          : 'open';
  const label = {
    open: '开放的 PR',
    draft: '草稿 PR',
    merged: '已合并的 PR',
    closed: '已关闭未合并的 PR',
  }[kind];
  return (
    <svg
      className={`pull-lifecycle-icon lifecycle-${kind}`}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={t(label)}
    >
      <title>{t(label)}</title>
      <circle cx="6" cy="4" r="2" />
      <circle cx="6" cy="20" r="2" />
      <path d="M6 6v12" />
      {kind === 'merged' ? (
        <>
          <circle cx="18" cy="4" r="2" />
          <path d="M18 6v1c0 5-12 3-12 9" />
        </>
      ) : kind === 'closed' ? (
        <>
          <circle cx="18" cy="20" r="2" />
          <path d="M18 18v-7M15 3l6 6M21 3l-6 6" />
        </>
      ) : kind === 'draft' ? (
        <>
          <circle cx="18" cy="20" r="2" />
          <path d="M18 18V7a3 3 0 0 0-3-3h-3" strokeDasharray="2 3" />
        </>
      ) : (
        <>
          <circle cx="18" cy="20" r="2" />
          <path d="M18 18V7a3 3 0 0 0-3-3h-3M14 1l-3 3 3 3" />
        </>
      )}
    </svg>
  );
}
