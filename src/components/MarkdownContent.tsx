import { lazy, Suspense } from 'react';
import Markdown from 'react-markdown';
import { codeLanguage } from '../lib/syntaxLanguage';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import './markdown.css';
import './syntax.css';

const SyntaxTokens = lazy(() => import('./SyntaxTokens'));

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="github-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          code: ({ className, children }) => {
            const hint = /(?:^|\s)language-([\w+-]+)/.exec(className ?? '')?.[1];
            const language = hint ? codeLanguage(hint) : undefined;
            const source = String(children ?? '');
            return (
              <code className={className}>
                {language ? (
                  <Suspense fallback={source}>
                    <SyntaxTokens source={source} language={language} />
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
                {alt || '查看图片'}
              </a>
            ) : null,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
