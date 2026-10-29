// Keep this module behind a dynamic import: only these grammars enter the reader bundle.
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import type { Element, RootContent } from 'hast';

const highlighter = createLowlight({
  bash,
  c,
  cpp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
});

export interface SyntaxToken {
  text: string;
  classes: string;
}

export const MAX_HIGHLIGHT_LENGTH = 32_000;
const MAX_LINE_LENGTH = 2_000;

export function highlightCode(source: string, language: string): SyntaxToken[] | undefined {
  if (
    source.length > MAX_HIGHLIGHT_LENGTH ||
    source.split('\n').some((line) => line.length > MAX_LINE_LENGTH) ||
    !highlighter.registered(language)
  )
    return undefined;
  try {
    const tokens: SyntaxToken[] = [];
    function visit(nodes: RootContent[] | Element['children'], classes = '') {
      for (const node of nodes) {
        if (node.type === 'text') tokens.push({ text: node.value, classes });
        else if (node.type === 'element') {
          const names = node.properties.className;
          // Only generated token class names are forwarded; source HTML is always text.
          const own = Array.isArray(names)
            ? names.filter((name) => typeof name === 'string' && /^[\w-]+$/.test(name)).join(' ')
            : '';
          visit(node.children, [classes, own].filter(Boolean).join(' '));
        }
      }
    }
    visit(highlighter.highlight(language, source).children);
    return tokens;
  } catch {
    return undefined;
  }
}

export function splitTokenLines(tokens: SyntaxToken[]): SyntaxToken[][] {
  const lines: SyntaxToken[][] = [[]];
  for (const token of tokens) {
    token.text.split('\n').forEach((text, index) => {
      if (index > 0) lines.push([]);
      if (text) lines[lines.length - 1].push({ text, classes: token.classes });
    });
  }
  return lines;
}
