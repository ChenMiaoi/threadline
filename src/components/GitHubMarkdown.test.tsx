// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GitHubMarkdown } from './GitHubMarkdown';
afterEach(cleanup);
describe('GitHub discussion rendering', () => {
  it('renders bot comments with native foldable details and formatted code', async () => {
    const { container } = render(
      <GitHubMarkdown>
        {
          '<!--LLVM PR SUMMARY COMMENT-->\n\n<details>\n<summary>Changes</summary>\n\n**Fixed behavior**\n\n```diff\n-old\n+new\n```\n\n</details>'
        }
      </GitHubMarkdown>,
    );
    await screen.findByText('Changes');
    const details = container.querySelector('details')!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText('Changes'));
    expect(container.querySelector('strong')?.textContent).toBe('Fixed behavior');
    expect(container.querySelector('pre code')?.textContent).toContain('+new');
    expect(container.textContent).not.toContain('LLVM PR SUMMARY COMMENT');
    expect(container.textContent).not.toContain('<summary>');
  });
  it('removes executable HTML, unsafe links, handlers, and styles from untrusted comments', async () => {
    const { container } = render(
      <GitHubMarkdown>
        {
          '<script>alert("secret")</script>\n\n[unsafe](javascript:alert%281%29)\n\n<img src="https://example.com/image" onerror="alert(1)" style="position:fixed">\n\n<iframe src="https://evil.test"></iframe>'
        }
      </GitHubMarkdown>,
    );
    await waitFor(() => expect(container.textContent).toContain('unsafe'));
    expect(container.querySelector('script,iframe,[onerror],[style]')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).not.toContain('secret');
  });
  it('renders GFM tables, task lists, and safe links', async () => {
    const { container } = render(
      <GitHubMarkdown>
        {
          '| Check | Result |\n| --- | --- |\n| Build | Passed |\n\n- [x] Done\n\n[GitHub](https://github.com/owner/project)'
        }
      </GitHubMarkdown>,
    );
    expect(await screen.findByRole('table')).toBeTruthy();
    expect((container.querySelector('input') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('rel')).toContain('noopener');
  });
});

it('highlights explicit fenced languages while preserving literal unsafe code and plain fallbacks', async () => {
  const { container } = render(
    <GitHubMarkdown>
      {
        '```ts\nconst message = "<img src=x onerror=alert(1)>";\n```\n\n```unknown-lang\nconst untouched = true;\n```\n\n`const inline = true`'
      }
    </GitHubMarkdown>,
  );
  await waitFor(() =>
    expect(container.querySelector('pre .hljs-keyword')?.textContent).toBe('const'),
  );
  const blocks = container.querySelectorAll('pre code');
  expect(blocks[0].textContent).toBe('const message = "<img src=x onerror=alert(1)>";\n');
  expect(container.querySelector('img,script,[onerror]')).toBeNull();
  expect(blocks[1].querySelector('span')).toBeNull();
  expect(container.querySelector('p code')?.querySelector('span')).toBeNull();
});

it('leaves oversized fenced code readable without tokenizing it', async () => {
  const source = 'const long = "' + 'x'.repeat(32_000) + '";';
  const { container } = render(<GitHubMarkdown>{'```js\n' + source + '\n```'}</GitHubMarkdown>);
  await waitFor(() => expect(container.querySelector('pre code')?.textContent).toBe(source + '\n'));
  expect(container.querySelector('pre code span')).toBeNull();
});

it('preserves nested sanitized HTML inside code with a language class', async () => {
  const { container } = render(
    <GitHubMarkdown>
      {'<pre><code class="language-js"><em onclick="alert(1)">const</em> value = 1;</code></pre>'}
    </GitHubMarkdown>,
  );
  await waitFor(() =>
    expect(container.querySelector('pre code')?.textContent).toBe('const value = 1;'),
  );
  expect(container.querySelector('pre code em')?.textContent).toBe('const');
  expect(container.textContent).not.toContain('[object Object]');
  expect(container.querySelector('[onclick], .hljs-keyword')).toBeNull();
});
