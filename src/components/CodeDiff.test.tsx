// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('highlights old and new hunk streams independently without changing signs, numbers, or literal HTML', async () => {
  const { container } = render(
    <CodeDiff
      filename="sample.ts"
      patch={
        '@@ -1,3 +1,3 @@\n-/* removed comment\n+const added = "<script>alert(1)</script>";\n const context = true;\n-*/\n+const end = false;'
      }
    />,
  );
  await waitFor(() =>
    expect(container.querySelector('.diff-added .hljs-keyword')?.textContent).toBe('const'),
  );
  expect(container.querySelector('.diff-added .diff-source')?.textContent).toBe(
    '+const added = "<script>alert(1)</script>";\n',
  );
  expect(container.querySelector('.diff-removed .hljs-comment')?.textContent).toBe(
    '/* removed comment',
  );
  expect(container.querySelector('.diff-context .hljs-keyword')?.textContent).toBe('const');
  expect(container.querySelector('.diff-added .diff-number:nth-child(2)')?.textContent).toBe('1');
  expect(container.querySelector('script')).toBeNull();
});

it('preserves plain text for unknown filenames and very long diff lines', async () => {
  const { container, rerender } = render(
    <CodeDiff filename="example.unknown" patch={'@@ -0,0 +1 @@\n+const value = true;'} />,
  );
  expect(container.querySelector('.hljs-keyword')).toBeNull();
  const source = '+const value = "' + 'x'.repeat(2500) + '";';
  rerender(<CodeDiff filename="example.ts" patch={'@@ -0,0 +1 @@\n' + source} />);
  await waitFor(() =>
    expect(container.querySelector('.diff-added .diff-source')?.textContent).toBe(source + '\n'),
  );
  expect(container.querySelector('.hljs-keyword')).toBeNull();
});
