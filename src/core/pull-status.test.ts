import { describe, expect, it } from 'vitest';
import { checkResultLabel, describePull } from './pull-status';
describe('PR status dimensions', () => {
  it('distinguishes approval, passing checks, and completed merge', () => {
    const open = describePull({
      state: 'OPEN',
      reviewDecision: 'APPROVED',
      checkState: 'FAILURE',
      mergeStateStatus: 'BLOCKED',
    });
    expect(open.lifecycle.label).toBe('开放');
    expect(open.review.label).toBe('已批准');
    expect(open.checks.label).toBe('失败');
    expect(open.merge.label).toBe('规则阻塞');
    expect(open.nextAction).toBe('作者修复失败检查');
    const clean = describePull({
      state: 'OPEN',
      reviewDecision: 'APPROVED',
      checkState: 'SUCCESS',
      mergeStateStatus: 'CLEAN',
    });
    expect(clean.group).toBe('评审已通过');
    expect(clean.merge.label).toBe('条件满足');
    expect(clean.lifecycle.label).not.toBe('已合并');
  });
  it('does not call completed or draft PRs an outstanding request for changes', () => {
    for (const state of ['MERGED', 'CLOSED']) {
      const result = describePull({
        state,
        isDraft: true,
        reviewDecision: 'CHANGES_REQUESTED',
        checkState: 'FAILURE',
      });
      expect(result.needsAuthorAction).toBe(false);
      expect(result.nextAction).toBe('流程已结束');
      expect(result.lifecycle.label).toBe(state === 'MERGED' ? '已合并' : '已关闭（未合并）');
    }
    const draft = describePull({
      state: 'OPEN',
      isDraft: true,
      reviewDecision: 'CHANGES_REQUESTED',
    });
    expect(draft.lifecycle.label).toBe('草稿');
    expect(draft.group).toBe('草稿');
    expect(draft.merge.label).toBe('草稿阶段');
  });
  it('separates requested changes from conflicts and rule blocking', () => {
    const changes = describePull({
      state: 'OPEN',
      reviewDecision: 'CHANGES_REQUESTED',
      mergeStateStatus: 'UNKNOWN',
    });
    expect(changes.review.label).toBe('要求变更');
    expect(changes.merge.label).toBe('待确认');
    expect(changes.needsAuthorAction).toBe(true);
    const conflict = describePull({ state: 'OPEN', mergeable: 'CONFLICTING' });
    expect(conflict.review.label).toBe('未返回结论');
    expect(conflict.merge.label).toBe('存在冲突');
    const blocked = describePull({ state: 'OPEN', mergeStateStatus: 'BLOCKED' });
    expect(blocked.merge.description).toContain('不能仅凭此状态推断原因');
    expect(blocked.nextAction).toContain('GitHub');
  });
  it('leaves missing/unknown data explicit instead of fabricating pass, approval, or blocking', () => {
    const result = describePull({
      state: 'OPEN',
      mergeStateStatus: 'UNKNOWN',
      mergeable: 'MERGEABLE',
    });
    expect(result.review.label).toBe('未返回结论');
    expect(result.checks.label).toBe('无记录');
    expect(result.merge.label).toBe('待确认');
    expect(result.nextAction).toBe('打开详情确认评审与合并条件');
  });
  it('does not invent a pending review requirement when GitHub says merge conditions are met', () => {
    expect(describePull({ state: 'OPEN', mergeStateStatus: 'CLEAN' }).group).toBe('合并条件已满足');
  });
});

it('keeps a completed check without a conclusion distinct from a passing check', () => {
  expect(checkResultLabel(null, 'completed')).toBe('已完成，未返回结论');
  expect(checkResultLabel('success', 'completed')).toBe('通过');
  expect(checkResultLabel('failure', 'completed')).toBe('失败');
  expect(checkResultLabel('new-value', 'completed')).toBe('未知结论：new-value');
});
