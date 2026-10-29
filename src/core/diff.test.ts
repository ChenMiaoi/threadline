import { describe, expect, it } from 'vitest';
import { parseDiff } from './diff';
describe('unified patch rendering', () => {
  it('tracks independent old and new line numbers across edits and hunks', () => {
    expect(parseDiff('@@ -3,2 +3,2 @@\n same\n-old\n+new\n@@ -20,0 +21,1 @@\n+extra\n')).toEqual([
      { kind: 'hunk', text: '@@ -3,2 +3,2 @@' },
      { kind: 'context', oldLine: 3, newLine: 3, text: ' same' },
      { kind: 'removed', oldLine: 4, text: '-old' },
      { kind: 'added', newLine: 4, text: '+new' },
      { kind: 'hunk', text: '@@ -20,0 +21,1 @@' },
      { kind: 'added', newLine: 21, text: '+extra' },
    ]);
  });
  it('handles new files, CRLF, blank context and EOF notes without inventing source lines', () => {
    const lines = parseDiff(
      '--- /dev/null\r\n+++ b/new\r\n@@ -0,0 +1,2 @@\r\n+<script>\r\n\\ No newline at end of file\r\n+next',
    );
    expect(lines[0].kind).toBe('meta');
    expect(lines[3]).toMatchObject({ kind: 'added', newLine: 1, text: '+<script>' });
    expect(lines[4].kind).toBe('meta');
    expect(lines[5].newLine).toBe(2);
    expect(parseDiff('@@ -1 +1 @@\n \n')[1]).toMatchObject({
      kind: 'context',
      oldLine: 1,
      newLine: 1,
    });
  });
});
