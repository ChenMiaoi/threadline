import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { DiffLine } from '../core/diff';
import { highlightCode, MAX_HIGHLIGHT_LENGTH, splitTokenLines } from '../lib/syntax';
import { TokenSpans } from './SyntaxTokens';
import { DiffLines } from './DiffLines';

export default memo(function HighlightedDiffLines({
  lines,
  language,
}: {
  lines: DiffLine[];
  language: string;
}) {
  const sources = useMemo(() => {
    const result: ReactNode[] = [];
    let budget = MAX_HIGHLIGHT_LENGTH;
    // Each hunk has two independent source streams so removals cannot alter added-code state.
    for (let start = 0; start < Math.min(lines.length, 1200) && budget > 0;) {
      if (lines[start].kind === 'hunk' || lines[start].kind === 'meta') {
        start++;
        continue;
      }
      let end = start;
      while (
        end < Math.min(lines.length, 1200) &&
        lines[end].kind !== 'hunk' &&
        lines[end].kind !== 'meta'
      )
        end++;
      for (const side of ['removed', 'added'] as const) {
        const indices = [];
        for (let index = start; index < end; index++) {
          if (lines[index].kind === side || lines[index].kind === 'context') indices.push(index);
        }
        const length = indices.reduce((total, index) => total + lines[index].text.length, 0);
        if (length > budget) continue;
        const source = indices.map((index) => lines[index].text.slice(1)).join('\n');
        budget -= source.length;
        const tokens = highlightCode(source, language);
        if (!tokens) continue;
        const tokenLines = splitTokenLines(tokens);
        indices.forEach((index, position) => {
          result[index] = (
            <>
              {lines[index].text[0]}
              <TokenSpans tokens={tokenLines[position] ?? []} />
            </>
          );
        });
      }
      start = end;
    }
    return result;
  }, [lines, language]);
  return <DiffLines lines={lines} sources={sources} />;
});
