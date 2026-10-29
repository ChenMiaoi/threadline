import type { PullStatus, StatusBadge } from '../core/pull-status';
import './pull-status.css';

function Badge({ name, value }: { name: string; value: StatusBadge }) {
  return (
    <span className={`status-badge status-${value.tone}`} title={value.description}>
      <span className="status-dimension">{name}：</span>
      {value.label}
    </span>
  );
}
export function PullStatusBadges({
  status,
  personal,
}: {
  status: PullStatus;
  personal?: StatusBadge;
}) {
  return (
    <span className="pull-status-badges">
      <Badge name="流程" value={status.lifecycle} />
      <Badge name="评审" value={status.review} />
      <Badge name="检查" value={status.checks} />
      <Badge name="合并" value={status.merge} />
      {personal && <Badge name="我的评审" value={personal} />}
    </span>
  );
}
