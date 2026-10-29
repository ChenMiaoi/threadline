import type { ReactNode } from 'react';
import type { DiffLine } from '../core/diff';

export function DiffLines({ lines, sources }: { lines: DiffLine[]; sources?: ReactNode[] }) {
  return lines.map((line, index) => (
    <span className={`diff-line diff-${line.kind}`} key={index}>
      <span className="diff-number" aria-hidden="true">
        {line.oldLine}
      </span>
      <span className="diff-number" aria-hidden="true">
        {line.newLine}
      </span>
      <span className="diff-source">
        {sources?.[index] ?? line.text}
        {'\n'}
      </span>
    </span>
  ));
}
