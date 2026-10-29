import { useI18n } from '../i18n/I18n';
import { remarkGitHubReferences } from '../lib/remarkGitHubReferences';
import { lazy, Suspense } from 'react';
import Markdown from 'react-markdown';
import { codeLanguage } from '../lib/syntaxLanguage';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import './markdown.css';
import './syntax.css';

const SyntaxTokens = lazy(() => import('./SyntaxTokens'));

export default function MarkdownContent({ children, repo }: { children: string; repo?: string }) {
  const { t } = useI18n();

  return (
    <div className="github-markdown">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkGitHubReferences, { repo }]]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          code: ({ className, children }) => {
            const hint = /(?:^|\s)language-([\w+-]+)/.exec(className ?? '')?.[1];
            const language = hint ? codeLanguage(hint) : undefined;
            return (
              <code className={className}>
                {language && typeof children === 'string' ? (
                  <Suspense fallback={children}>
                    <SyntaxTokens source={children} language={language} />
                  </Suspense>
                ) : (
                  children
                )}
              </code>
            );
          },
          a: ({ href, children, title }) => (
            <a href={href} title={title} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === 'string' ? (
              <a href={src} target="_blank" rel="noopener noreferrer">
                {alt || t('查看图片')}
              </a>
            ) : null,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
