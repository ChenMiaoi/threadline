import { useI18n } from '../i18n/I18n';
import { lazy, memo, Suspense } from 'react';
import { loadMarkdown } from '../lib/markdown';
const MarkdownContent = lazy(loadMarkdown);
export const GitHubMarkdown = memo(function GitHubMarkdown({
  children,
  repo,
}: {
  children: string;
  repo?: string;
}) {
  const { t } = useI18n();

  return (
    <Suspense fallback={<p role="status">{t('正在显示内容…')}</p>}>
      <MarkdownContent repo={repo}>{children}</MarkdownContent>
    </Suspense>
  );
});
