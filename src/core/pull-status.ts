export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'merged';
export interface StatusBadge {
  label: string;
  tone: StatusTone;
  description: string;
}
export interface PullStatus {
  state: 'open' | 'merged' | 'closed';
  draft: boolean;
  lifecycle: StatusBadge;
  review: StatusBadge;
  checks: StatusBadge;
  merge: StatusBadge;
  group: string;
  nextAction: string;
  needsAuthorAction: boolean;
}
export interface PullStatusInput {
  state: string;
  isDraft?: boolean;
  reviewDecision?: string | null;
  checkState?: string | null;
  mergeStateStatus?: string | null;
  mergeable?: string | null;
}
function badge(label: string, tone: StatusTone, description: string): StatusBadge {
  return { label, tone, description };
}
export function describePull(input: PullStatusInput): PullStatus {
  const state =
    input.state.toLowerCase() === 'merged'
      ? 'merged'
      : input.state.toLowerCase() === 'closed'
        ? 'closed'
        : 'open';
  const draft = state === 'open' && Boolean(input.isDraft);
  const lifecycle =
    state === 'merged'
      ? badge('已合并', 'merged', '代码已经合入目标分支，PR 流程已结束。')
      : state === 'closed'
        ? badge('已关闭（未合并）', 'danger', 'PR 已关闭，代码没有通过此 PR 合入目标分支。')
        : draft
          ? badge('草稿', 'neutral', '作者尚未标记为可正式评审；草稿属于未结束的 PR。')
          : badge('开放', 'success', 'PR 尚未结束，正在等待评审、修改或合并。');
  const review =
    input.reviewDecision === 'CHANGES_REQUESTED'
      ? badge('要求变更', 'warning', '正式评审要求作者修改；这是一项评审结论。')
      : input.reviewDecision === 'APPROVED'
        ? badge('已批准', 'success', 'GitHub 汇总评审已通过；是否可合并还取决于检查和合并规则。')
        : input.reviewDecision === 'REVIEW_REQUIRED'
          ? badge('待评审', 'info', 'GitHub 表示仍需要满足评审要求。')
          : badge('未返回结论', 'neutral', 'GitHub 未提供汇总评审结论；普通评论不等于正式批准。');
  const checks =
    input.checkState === 'SUCCESS'
      ? badge('通过', 'success', '当前 HEAD 的检查汇总通过。')
      : input.checkState === 'FAILURE' || input.checkState === 'ERROR'
        ? badge('失败', 'danger', '当前 HEAD 存在失败检查；请打开检查标签查看具体结果。')
        : input.checkState
          ? badge('进行中', 'info', '当前 HEAD 的检查尚未全部完成。')
          : badge('无记录', 'neutral', '没有检查汇总记录，不能据此认为检查已通过。');
  let merge: StatusBadge;
  if (state !== 'open')
    merge = badge('流程已结束', 'neutral', '此 PR 已合并或关闭，不再等待合并。');
  else if (draft) merge = badge('草稿阶段', 'neutral', '作者需先将草稿标记为可评审。');
  else if (input.mergeable === 'CONFLICTING' || input.mergeStateStatus === 'DIRTY')
    merge = badge('存在冲突', 'danger', 'GitHub 报告分支存在合并冲突。');
  else if (input.mergeStateStatus === 'BLOCKED')
    merge = badge(
      '规则阻塞',
      'danger',
      'GitHub 报告合并受规则阻塞；具体未满足条件需在 GitHub 查看，不能仅凭此状态推断原因。',
    );
  else if (input.mergeStateStatus === 'BEHIND')
    merge = badge('分支落后', 'warning', '源分支落后于目标分支；需按仓库规则更新。');
  else if (input.mergeStateStatus === 'UNSTABLE')
    merge = badge('检查未通过', 'warning', 'GitHub 报告检查条件未全部通过；分支不一定存在冲突。');
  else if (input.mergeStateStatus === 'CLEAN')
    merge = badge(
      '条件满足',
      'success',
      'GitHub 当前报告可合并且提交状态通过；实际操作仍受账号权限和仓库规则约束。',
    );
  else if (input.mergeStateStatus === 'HAS_HOOKS')
    merge = badge('需服务端校验', 'info', 'GitHub 报告可合并，但合并时仍需通过服务端钩子。');
  else merge = badge('待确认', 'neutral', 'GitHub 尚未确定或未返回合并条件；没有据此推断为受阻。');

  let group: string;
  let nextAction: string;
  let needsAuthorAction = false;
  if (state === 'merged') {
    group = '已合并';
    nextAction = '流程已结束';
  } else if (state === 'closed') {
    group = '已关闭（未合并）';
    nextAction = '流程已结束';
  } else if (draft) {
    group = '草稿';
    nextAction = '作者完成草稿后发起评审';
  } else if (input.reviewDecision === 'CHANGES_REQUESTED') {
    group = '需要我的处理';
    nextAction = '作者按评审意见修改';
    needsAuthorAction = true;
  } else if (input.mergeable === 'CONFLICTING' || input.mergeStateStatus === 'DIRTY') {
    group = '需要我的处理';
    nextAction = '作者解决合并冲突';
    needsAuthorAction = true;
  } else if (input.checkState === 'FAILURE' || input.checkState === 'ERROR') {
    group = '需要我的处理';
    nextAction = '作者修复失败检查';
    needsAuthorAction = true;
  } else if (input.mergeStateStatus === 'BEHIND') {
    group = '需要我的处理';
    nextAction = '作者按仓库规则更新分支';
    needsAuthorAction = true;
  } else if (input.mergeStateStatus === 'BLOCKED') {
    group = '合并条件未满足';
    nextAction = '查看 GitHub 上未满足的合并条件';
  } else if (input.reviewDecision === 'APPROVED') {
    group = '评审已通过';
    nextAction =
      input.mergeStateStatus === 'CLEAN'
        ? '有权限的维护者可前往 GitHub 合并'
        : '确认剩余合并条件，等待维护者合并';
  } else if (input.mergeStateStatus === 'CLEAN') {
    group = '合并条件已满足';
    nextAction = '有权限的维护者可前往 GitHub 合并';
  } else if (input.reviewDecision === 'REVIEW_REQUIRED') {
    group = '等待评审';
    nextAction = '等待评审者给出正式结论';
  } else {
    group = '评审状态待确认';
    nextAction = '打开详情确认评审与合并条件';
  }
  return { state, draft, lifecycle, review, checks, merge, group, nextAction, needsAuthorAction };
}

export function checkResultLabel(conclusion: string | null | undefined, status: string) {
  const conclusions: Record<string, string> = {
    success: '通过',
    failure: '失败',
    neutral: '中性结果',
    cancelled: '已取消',
    timed_out: '超时',
    action_required: '需手动处理',
    skipped: '已跳过',
    stale: '已过期',
    startup_failure: '启动失败',
  };
  const states: Record<string, string> = {
    queued: '排队中',
    in_progress: '运行中',
    pending: '等待中',
    waiting: '等待执行',
    requested: '待启动',
    completed: '已完成，未返回结论',
  };
  return conclusion
    ? (conclusions[conclusion] ?? `未知结论：${conclusion}`)
    : (states[status] ?? `未知状态：${status}`);
}
