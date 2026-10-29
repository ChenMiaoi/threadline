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
export function PullStatusLegend() {
  return (
    <details className="status-legend">
      <summary>状态说明</summary>
      <dl>
        <dt>流程</dt>
        <dd>
          开放、草稿、已合并、已关闭。草稿仍未结束；已关闭表示未合并结束。流程结束后，其它标签保留历史结果，不再表示有待办任务。
        </dd>
        <dt>评审</dt>
        <dd>
          待评审、已批准、要求变更是正式评审结论。批准后仍需满足合并条件；普通评论不代表批准。
        </dd>
        <dt>检查</dt>
        <dd>当前代码的自动检查结果：通过、失败、进行中或无记录。无记录不表示通过。</dd>
        <dt>合并</dt>
        <dd>
          存在冲突、规则阻塞、分支落后等来自 GitHub 的合并条件。规则阻塞的具体原因需在 GitHub 查看。
        </dd>
        <dt>我的评审</dt>
        <dd>只表示你的个人结论。“旧版本”表示评审后有新提交；请查看新代码后决定是否重新评审。</dd>
      </dl>
    </details>
  );
}
