import { expect, it } from 'vitest';
import { normalizeWorkspace, defaultWorkspace } from './workspace';
import { defaultTypography } from './appearance';
import { typographyStyle } from '../lib/appearance';
it('migrates old preferences and rejects unsupported fonts, sizes and injected CSS', () => {
  expect(
    normalizeWorkspace({ version: 1, preferences: { theme: 'light' } }, Date.now()).preferences
      .typography,
  ).toEqual(defaultTypography);
  const value = normalizeWorkspace(
    {
      preferences: {
        typography: { uiFont: 'url(evil)', uiSize: 999, codeSize: 16, codeWrap: 100 },
      },
    },
    Date.now(),
  ).preferences.typography;
  expect(value.uiFont).toBe('default');
  expect(value.uiSize).toBe(14);
  expect(value.codeSize).toBe(16);
  expect(value.codeWrap).toBe(100);
});
it('round-trips independent typography and applies separate reading and code variables', () => {
  const data = defaultWorkspace();
  data.preferences.typography = {
    ...defaultTypography,
    uiSize: 18,
    readingSize: 20,
    codeSize: 12,
    codeWrap: 0,
  };
  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(data)), Date.now());
  expect(restored.preferences.typography).toEqual(data.preferences.typography);
  const style = typographyStyle(restored.preferences.typography) as Record<string, unknown>;
  expect(style['--reading-size']).toBe('20px');
  expect(style['--code-size']).toBe('12px');
  expect(style['--code-wrap']).toBe('pre');
});

it('persists installed font families and escapes CSS family names', () => {
  const typography = normalizeWorkspace(
    {
      preferences: {
        typography: {
          uiFont: 'font:微软雅黑',
          readingFont: 'font:A"; color: red; /*',
          codeFont: 'font:Consolas',
        },
      },
    },
    Date.now(),
  ).preferences.typography;
  expect(typography.uiFont).toBe('font:微软雅黑');
  const style = typographyStyle(typography) as Record<string, unknown>;
  expect(style['--ui-font']).toContain('"微软雅黑"');
  expect(style['--reading-font']).toContain('"A\\"; color: red; /*"');
  expect(
    normalizeWorkspace({ preferences: { typography: { uiFont: 'font:bad\nfont' } } }, Date.now())
      .preferences.typography.uiFont,
  ).toBe('default');
});
