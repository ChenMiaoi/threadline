// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ReviewVersionStatus } from './ReviewVersionStatus';

afterEach(cleanup);
it('uses distinct current and outdated icons with accessible commit details', () => {
  const { rerender } = render(<ReviewVersionStatus commit="abcdef12345" head="abcdef12345" />);
  const current = screen.getByRole('img', { name: '评审针对当前版本' });
  expect(current.classList.contains('is-current')).toBe(true);
  expect(current.getAttribute('tabindex')).toBe('0');
  expect(document.getElementById(current.getAttribute('aria-describedby')!)?.textContent).toContain(
    'abcdef1',
  );
  rerender(<ReviewVersionStatus commit="abcdef12345" head="newhead12345" />);
  expect(
    screen.getByRole('img', { name: '评审针对旧版本' }).classList.contains('is-outdated'),
  ).toBe(true);
  expect(screen.getByRole('tooltip').textContent).toContain('代码版本已变化');
  expect(screen.getByRole('tooltip').textContent).toContain('newhead');
});

it('does not claim freshness or staleness when a commit is missing', () => {
  render(<ReviewVersionStatus commit="" head="" />);
  expect(
    screen.getByRole('img', { name: '评审版本暂不可确认' }).classList.contains('is-unknown'),
  ).toBe(true);
  expect(document.querySelector('.is-current, .is-outdated')).toBeNull();
});
