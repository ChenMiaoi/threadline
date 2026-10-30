import { describePull } from '../core/pull-status';
// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PullLifecycleIcon } from './PullLifecycleIcon';
afterEach(cleanup);
it('identifies open/draft/merged/closed PRs and gives terminal states priority over a stale draft flag', () => {
  const { rerender } = render(<PullLifecycleIcon status={{ state: 'open', draft: false }} />);
  expect(screen.getByRole('img', { name: '开放的 PR' })).toBeTruthy();
  rerender(<PullLifecycleIcon status={{ state: 'open', draft: true }} />);
  expect(screen.getByRole('img', { name: '草稿 PR' })).toBeTruthy();
  rerender(<PullLifecycleIcon status={{ state: 'merged', draft: true }} />);
  expect(screen.getByRole('img', { name: '已合并的 PR' })).toBeTruthy();
  rerender(<PullLifecycleIcon status={{ state: 'closed', draft: true }} />);
  expect(screen.getByRole('img', { name: '已关闭未合并的 PR' })).toBeTruthy();
});

it('highlights requested changes only for active non-draft PRs', () => {
  const { rerender } = render(
    <PullLifecycleIcon
      status={describePull({ state: 'open', reviewDecision: 'CHANGES_REQUESTED' })}
    />,
  );
  expect(
    screen
      .getByRole('img', { name: '要求变更的 PR' })
      .classList.contains('lifecycle-changes-requested'),
  ).toBe(true);
  for (const input of [
    { state: 'merged' },
    { state: 'closed' },
    { state: 'open', isDraft: true },
  ]) {
    rerender(
      <PullLifecycleIcon
        status={describePull({ ...input, reviewDecision: 'CHANGES_REQUESTED' })}
      />,
    );
    expect(screen.queryByRole('img', { name: '要求变更的 PR' })).toBeNull();
    expect(document.querySelector('.lifecycle-changes-requested')).toBeNull();
  }
});
