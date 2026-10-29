import { describe, expect, it } from 'vitest';
import { codeLanguage, filenameLanguage } from './syntaxLanguage';
import { highlightCode, MAX_HIGHLIGHT_LENGTH, splitTokenLines } from './syntax';

describe('bounded explicit syntax highlighting', () => {
  it('resolves language aliases and file extensions without guessing unknown text', () => {
    expect(codeLanguage('TSX')).toBe('typescript');
    expect(filenameLanguage('path/component.jsx')).toBe('javascript');
    expect(filenameLanguage('README.md')).toBeUndefined();
    expect(codeLanguage('constructor')).toBeUndefined();
    expect(highlightCode('const value = true;', 'unknown')).toBeUndefined();
  });
  it('falls back for both huge blocks and individual long lines', () => {
    expect(highlightCode('x\n'.repeat(MAX_HIGHLIGHT_LENGTH), 'javascript')).toBeUndefined();
    expect(highlightCode('x'.repeat(2001), 'javascript')).toBeUndefined();
  });
  it('retains multiline token classes and every source character when splitting lines', () => {
    const source = '/* first\nsecond */\nconst value = "<img>";\n';
    const tokens = highlightCode(source, 'typescript')!;
    expect(tokens.map((token) => token.text).join('')).toBe(source);
    const lines = splitTokenLines(tokens);
    expect(lines.map((line) => line.map((token) => token.text).join('')).join('\n')).toBe(source);
    expect(lines[1][0].classes).toContain('hljs-comment');
  });
});
