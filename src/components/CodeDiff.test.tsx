// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CodeDiff } from './CodeDiff';
afterEach(cleanup);
it('keeps large patches responsive while letting the reader reveal all remaining lines', () => {
  const patch =
    '@@ -0,0 +1,405 @@\n' +
    Array.from({ length: 405 }, (_, index) => `+line${index + 1}`).join('\n');
  render(<CodeDiff filename="large.ts" patch={patch} />);
  expect(screen.getByText('+line1')).toBeTruthy();
  expect(screen.queryByText('+line405')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /显示更多差异/ }));
  expect(screen.getByText('+line405')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /显示更多差异/ })).toBeNull();
});

it('lets keyboard readers move across long lines and opt into wrapping without altering the patch', () => {
  const text = '+' + 'long_identifier '.repeat(80);
  render(<CodeDiff filename="long.ts" patch={'@@ -0,0 +1 @@\n' + text} />);
  const region = screen.getByRole('region', { name: 'long.ts 的代码差异' });
  Object.defineProperty(region, 'scrollBy', {
    value: vi.fn(({ left }: { left: number }) => {
      region.scrollLeft += left;
    }),
  });
  fireEvent.keyDown(region, { key: 'ArrowRight' });
  expect(region.scrollLeft).toBe(160);
  fireEvent.keyDown(region, { key: 'ArrowLeft' });
  expect(region.scrollLeft).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: '自动换行' }));
  expect(screen.getByRole('button', { name: '自动换行' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  fireEvent.keyDown(region, { key: 'ArrowRight' });
  expect(region.scrollLeft).toBe(0);
  expect(region.textContent).toContain(text);
});
