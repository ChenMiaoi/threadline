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
  return (
    <span
      className={`status-badge status-${value.tone}${primary ? ' status-primary' : ''}`}
      title={value.description}
    >
      <span className="status-dimension">{name}：</span>
      {value.label}
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
      <Badge name="流程" value={status.lifecycle} primary={primary === status.lifecycle} />
      <Badge name="评审" value={status.review} primary={primary === status.review} />
      <Badge name="检查" value={status.checks} primary={primary === status.checks} />
      <Badge name="合并" value={status.merge} primary={primary === status.merge} />
      {personal && <Badge name="我的评审" value={personal} primary />}
    </span>
  );
}
