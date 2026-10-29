import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import './markdown.css';

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="github-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
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
