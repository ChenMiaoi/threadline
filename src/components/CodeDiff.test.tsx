// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
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

it('preserves one logical row and line number per source line when long code wraps visually', () => {
  const text = '+' + 'long_identifier '.repeat(80);
  const { container } = render(
    <CodeDiff filename="long.unknown" patch={'@@ -0,0 +40,2 @@\n' + text + '\n+next();'} />,
  );
  expect(screen.queryByRole('button', { name: '自动换行' })).toBeNull();
  const rows = container.querySelectorAll('.diff-added');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('.diff-source')?.textContent).toBe(text + '\n');
  expect([...rows].map((row) => row.querySelector('.diff-number')?.textContent)).toEqual([
    '40',
    '41',
  ]);
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
  expect(container.querySelector('.diff-added .diff-number')?.textContent).toBe('1');
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

it('shows one number per row while retaining old/new locations in the tooltip', () => {
  const { container } = render(
    <CodeDiff
      filename="sample.unknown"
      patch={'@@ -10,3 +20,3 @@\n before\n-removed\n+added\n after'}
    />,
  );
  const rows = container.querySelectorAll('.diff-context, .diff-added, .diff-removed');
  expect([...rows].map((row) => row.querySelectorAll('.diff-number').length)).toEqual([1, 1, 1, 1]);
  expect([...rows].map((row) => row.querySelector('.diff-number')?.textContent)).toEqual([
    '20',
    '11',
    '21',
    '22',
  ]);
  expect(screen.getByTitle('旧行 10 · 新行 20')).toBeTruthy();
  expect(screen.getByTitle('旧行 11 · 新行 —')).toBeTruthy();
  expect(screen.getByTitle('旧行 — · 新行 21')).toBeTruthy();
});
