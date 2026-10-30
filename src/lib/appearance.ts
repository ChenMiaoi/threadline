import type { CSSProperties } from 'react';
import type { TypographyPreferences } from '../core/appearance';
const fonts = {
  default: "'Inter Variable', 'Noto Sans SC Variable', 'Microsoft YaHei', sans-serif",
  system: "system-ui, 'Microsoft YaHei', sans-serif",
  serif: "Georgia, 'Noto Serif CJK SC', 'SimSun', serif",
};
const codeFonts = {
  default: "ui-monospace, 'Cascadia Code', Consolas, 'Liberation Mono', monospace",
  consolas: "Consolas, 'Liberation Mono', monospace",
  cascadia: "'Cascadia Code', Consolas, monospace",
  menlo: 'Menlo, Monaco, Consolas, monospace',
};
function fontFamily(value: string, aliases: Record<string, string>, fallback: string) {
  // CSS string escaping keeps even quoted family names inside a single family value.
  return value.startsWith('font:')
    ? `${JSON.stringify(value.slice(5))}, ${fallback}`
    : (aliases[value] ?? fallback);
}
export function typographyStyle(prefs: TypographyPreferences): CSSProperties {
  return {
    '--ui-font': fontFamily(prefs.uiFont, fonts, fonts.system),
    '--ui-scale': prefs.uiSize / 14,
    '--reading-font': fontFamily(prefs.readingFont, fonts, fonts.system),
    '--reading-size': `${prefs.readingSize}px`,
    '--reading-scale': prefs.readingSize / 14,
    '--reading-line-height': prefs.readingLineHeight,
    '--reading-width': prefs.readingWidth ? `${prefs.readingWidth}px` : 'none',
    '--code-font': fontFamily(prefs.codeFont, codeFonts, codeFonts.default),
    '--code-size': `${prefs.codeSize}px`,
    '--code-line-height': prefs.codeLineHeight,
    '--code-row-height': `${prefs.codeSize * prefs.codeLineHeight}px`,
    '--code-width': prefs.codeWrap ? `calc(${prefs.codeWrap}ch + 24px)` : 'none',
    '--code-wrap': prefs.codeWrap ? 'pre-wrap' : 'pre',
  } as CSSProperties;
}
