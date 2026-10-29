import type { CheckRun, CommitStatus } from './github';
import { checkResultLabel } from './pull-status';
export type CheckKind = 'failed' | 'pending' | 'other' | 'passed';
export function describeChecks(runs: readonly CheckRun[], statuses: readonly CommitStatus[]) {
  const classify = (value: string | null): CheckKind =>
    value === 'success'
      ? 'passed'
      : ['failure', 'error', 'timed_out', 'startup_failure', 'action_required'].includes(
            value ?? '',
          )
        ? 'failed'
        : !value || ['pending', 'queued', 'in_progress', 'requested', 'waiting'].includes(value)
          ? 'pending'
          : 'other';
  const rows = [
    ...runs.map((run) => ({
      key: `run-${run.id}`,
      name: run.name,
      label: checkResultLabel(run.conclusion, run.status),
      kind: classify(run.conclusion ?? (run.status === 'completed' ? 'unknown' : run.status)),
    })),
    ...statuses.map((status) => ({
      key: `status-${status.context}`,
      name: status.context,
      label:
        (
          { success: '通过', failure: '失败', error: '出错', pending: '等待中' } as Record<
            string,
            string
          >
        )[status.state] ?? `未知状态：${status.state}`,
      kind: classify(status.state),
    })),
  ];
  const priority: Record<CheckKind, number> = { failed: 0, pending: 1, other: 2, passed: 3 };
  rows.sort((a, b) => priority[a.kind] - priority[b.kind]);
  return {
    rows,
    counts: Object.fromEntries(
      (['failed', 'pending', 'other', 'passed'] as const).map((kind) => [
        kind,
        rows.filter((row) => row.kind === kind).length,
      ]),
    ) as Record<CheckKind, number>,
  };
}
