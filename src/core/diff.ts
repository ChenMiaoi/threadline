export interface DiffLine {
  kind: 'hunk' | 'added' | 'removed' | 'context' | 'meta';
  oldLine?: number;
  newLine?: number;
  text: string;
}

/** Parse unified patch hunks without treating file headers or EOF notes as source lines. */
export function parseDiff(patch: string): DiffLine[] {
  let oldLine: number | undefined;
  let newLine: number | undefined;
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { kind: 'hunk', text };
    }
    if (oldLine === undefined || newLine === undefined || text.startsWith('\\'))
      return { kind: 'meta', text };
    if (text.startsWith('+')) return { kind: 'added', newLine: newLine++, text };
    if (text.startsWith('-')) return { kind: 'removed', oldLine: oldLine++, text };
    if (text.startsWith(' '))
      return { kind: 'context', oldLine: oldLine++, newLine: newLine++, text };
    return { kind: 'meta', text };
  });
}
