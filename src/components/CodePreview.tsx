import { useMemo } from 'react';
import { highlightCode, splitTokenLines } from '../lib/syntax';
import { TokenSpans } from './SyntaxTokens';
import './syntax.css';

const source = `// Keep each source line numbered when it wraps.
template <typename T>
T add(T left, T right) {
  const auto label = "sum";
  return left + right + 42;
}`;

export default function CodePreview() {
  const lines = useMemo(() => {
    const tokens = highlightCode(source, 'cpp');
    return tokens
      ? splitTokenLines(tokens)
      : source.split('\n').map((text) => [{ text, classes: '' }]);
  }, []);
  return (
    <pre className="code-preview">
      <code>
        {lines.map((tokens, index) => (
          <span className="code-preview-line" key={index}>
            <span className="code-preview-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="code-preview-source">
              <TokenSpans tokens={tokens} />
              {'\n'}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
