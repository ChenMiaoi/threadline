import { useMemo, useState } from 'react';
import { parseDiff } from '../core/diff';

export function CodeDiff({ patch, filename }: { patch: string; filename: string }) {
  const [limit, setLimit] = useState(400);
  const [wrap, setWrap] = useState(false);
  const lines = useMemo(() => parseDiff(patch), [patch]);
  return (
    <>
      <div className="diff-toolbar">
        <span>旧行 · 新行</span>
        <button className="chip" aria-pressed={wrap} onClick={() => setWrap((current) => !current)}>
          自动换行
        </button>
      </div>
      <pre
        className={`github-patch${wrap ? ' diff-wrap' : ''}`}
        tabIndex={0}
        role="region"
        aria-label={`${filename} 的代码差异`}
        onKeyDown={(event) => {
          if (
            !wrap &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          ) {
            event.preventDefault();
            event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? 160 : -160 });
          }
        }}
      >
        <code>
          {lines.slice(0, limit).map((line, index) => (
            <span className={`diff-line diff-${line.kind}`} key={index}>
              <span className="diff-number" aria-hidden="true">
                {line.oldLine}
              </span>
              <span className="diff-number" aria-hidden="true">
                {line.newLine}
              </span>
              <span className="diff-source">
                {line.text}
                {'\n'}
              </span>
            </span>
          ))}
        </code>
      </pre>
      {lines.length > limit && (
        <button className="chip" onClick={() => setLimit((current) => current + 400)}>
          显示更多差异（还有 {lines.length - limit} 行）
        </button>
      )}
    </>
  );
}
