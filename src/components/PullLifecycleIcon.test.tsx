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
