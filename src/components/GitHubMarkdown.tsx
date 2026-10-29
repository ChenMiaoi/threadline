import { lazy, Suspense } from 'react';
const MarkdownContent = lazy(() => import('./MarkdownContent'));
export function GitHubMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<p role="status">正在显示内容…</p>}>
      <MarkdownContent>{children}</MarkdownContent>
    </Suspense>
  );
}
