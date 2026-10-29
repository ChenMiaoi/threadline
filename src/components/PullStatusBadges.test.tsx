// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { describePull } from '../core/pull-status';
import { PullStatusBadges } from './PullStatusBadges';
afterEach(cleanup);
it('exposes each status value in a selectable row instead of replacing them with a generic accessible label', () => {
  render(
    <button>
      <PullStatusBadges
        status={describePull({
          state: 'OPEN',
          reviewDecision: 'APPROVED',
          checkState: 'FAILURE',
          mergeStateStatus: 'BLOCKED',
        })}
        personal={{ label: '要求变更 · 旧版本', tone: 'warning', description: 'Personal review' }}
      />
    </button>,
  );
  for (const value of [
    /流程：\s*开放/,
    /评审：\s*已批准/,
    /检查：\s*失败/,
    /合并：\s*规则阻塞/,
    /我的评审：\s*要求变更 · 旧版本/,
  ]) {
    expect(screen.getByRole('button', { name: value })).toBeTruthy();
  }
});

it('retains semantic labels and distinct colors alongside icons in compact lists', () => {
  const { container } = render(
    <button>
      <PullStatusBadges
        compact
        status={describePull({
          state: 'OPEN',
          reviewDecision: 'CHANGES_REQUESTED',
          checkState: 'SUCCESS',
          mergeStateStatus: 'BLOCKED',
        })}
      />
    </button>,
  );
  for (const value of [/评审：\s*要求变更/, /检查：\s*通过/, /合并：\s*规则阻塞/]) {
    expect(screen.getByRole('button', { name: value })).toBeTruthy();
  }
  expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
  expect(
    screen.getByText('要求变更').closest('.status-badge')?.classList.contains('status-warning'),
  ).toBe(true);
  expect(
    screen.getByText('通过').closest('.status-badge')?.classList.contains('status-success'),
  ).toBe(true);
  expect(
    screen.getByText('规则阻塞').closest('.status-badge')?.classList.contains('status-danger'),
  ).toBe(true);
});
