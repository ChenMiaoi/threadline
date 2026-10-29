import { useI18n } from '../i18n/I18n';
import type { PullStatus, StatusBadge } from '../core/pull-status';
import './pull-status.css';

function Badge({
  name,
  value,
  primary = false,
}: {
  name: string;
  value: StatusBadge;
  primary?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span
      className={`status-badge status-${value.tone}${primary ? ' status-primary' : ''}`}
      title={t(value.description)}
    >
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

  const primary =
    personal ??
    (status.state !== 'open' || status.draft
      ? status.lifecycle
      : status.review.tone === 'warning'
        ? status.review
        : status.checks.tone === 'danger'
          ? status.checks
          : status.merge.tone === 'danger'
            ? status.merge
            : status.lifecycle);
  return (
    <span className={`pull-status-badges${compact ? ' status-compact' : ''}`}>
      <Badge name={t('流程')} value={status.lifecycle} primary={primary === status.lifecycle} />
      <Badge name={t('评审')} value={status.review} primary={primary === status.review} />
      <Badge name={t('检查')} value={status.checks} primary={primary === status.checks} />
      <Badge name={t('合并')} value={status.merge} primary={primary === status.merge} />
      {personal && <Badge name={t('我的评审')} value={personal} primary />}
    </span>
  );
}
