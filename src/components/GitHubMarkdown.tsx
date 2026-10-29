import { lazy, memo, Suspense } from 'react';
import { loadMarkdown } from '../lib/markdown';
const MarkdownContent = lazy(loadMarkdown);
export const GitHubMarkdown = memo(function GitHubMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<p role="status">正在显示内容…</p>}>
      <MarkdownContent>{children}</MarkdownContent>
    </Suspense>
  );
});
