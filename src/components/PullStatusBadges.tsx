import { useI18n } from '../i18n/I18n';
import type { PullStatus, StatusBadge } from '../core/pull-status';
import './pull-status.css';

function Badge({
  name,
  value,
  icon,
}: {
  name: string;
  value: StatusBadge;
  icon: 'lifecycle' | 'review' | 'checks' | 'merge' | 'personal';
}) {
  const { t } = useI18n();
  return (
    <span
      className={`status-badge status-${value.tone}`}
      title={`${name}：${t(value.label)} · ${t(value.description)}`}
    >
      <svg
        className="status-icon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon === 'lifecycle' ? (
          <>
            <circle cx="5" cy="4" r="2" />
            <circle cx="5" cy="16" r="2" />
            <circle cx="15" cy="16" r="2" />
            <path d="M5 6v8M15 14V7a3 3 0 0 0-3-3h-2" />
          </>
        ) : icon === 'personal' ? (
          <>
            <circle cx="8" cy="6" r="3" />
            <path d="M2 17v-2a6 6 0 0 1 10-4M13 15l2 2 3-4" />
          </>
        ) : icon === 'review' ? (
          <>
            <path d="M10 2 17 5v5c0 4-7 8-7 8S3 14 3 10V5Z" />
            <path d="m7 10 2 2 4-4" />
          </>
        ) : icon === 'merge' ? (
          <>
            <circle cx="5" cy="4" r="2" />
            <circle cx="15" cy="4" r="2" />
            <circle cx="10" cy="16" r="2" />
            <path d="M5 6v1c0 4 5 2 5 7M15 6v1c0 4-5 2-5 7" />
          </>
        ) : value.tone === 'danger' ? (
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="m7 7 6 6m0-6-6 6" />
          </>
        ) : value.tone === 'success' ? (
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="m6 10 3 3 5-6" />
          </>
        ) : (
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="M10 6v4l3 2" />
          </>
        )}
      </svg>
      <span className="status-dimension">{name}：</span>
      {t(value.label)}
    </span>
  );
}
export function PullStatusBadges({
  status,
  personal,
  compact = false,
}: {
  status: PullStatus;
  personal?: StatusBadge;
  compact?: boolean;
}) {
  const { t } = useI18n();

  return (
    <span className={`pull-status-badges${compact ? ' status-compact' : ''}`}>
      <Badge name={t('流程')} value={status.lifecycle} icon="lifecycle" />
      <Badge name={t('评审')} value={status.review} icon="review" />
      <Badge name={t('检查')} value={status.checks} icon="checks" />
      <Badge name={t('合并')} value={status.merge} icon="merge" />
      {personal && <Badge name={t('我的评审')} value={personal} icon="personal" />}
    </span>
  );
}
