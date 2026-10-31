import { describe, expect, it } from 'vitest';
import { colorThemes, resolveColorMode, type ColorMode } from './themes';
import { defaultWorkspace, normalizeWorkspace } from './workspace';

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('color themes', () => {
  it('restores existing appearance preferences and rejects unknown palette ids', () => {
    for (const colorTheme of [undefined, null, 'outside', '__proto__', { id: 'nord' }]) {
      const preferences = normalizeWorkspace(
        { preferences: { theme: 'light', colorTheme, themeGradient: 'true' } },
        0,
      ).preferences;
      expect(preferences.theme).toBe('light');
      expect(preferences.colorTheme).toBe('threadline');
      expect(preferences.themeGradient).toBe(true);
    }
  });

  it.each(colorThemes)(
    'persists $id independently of display mode and gradient preference',
    (theme) => {
      const data = defaultWorkspace();
      data.preferences = {
        ...data.preferences,
        colorTheme: theme.id,
        theme: 'system',
        themeGradient: false,
      };
      expect(normalizeWorkspace(JSON.parse(JSON.stringify(data)), 0).preferences).toEqual(
        data.preferences,
      );
    },
  );

  it('follows system appearance only when requested', () => {
    expect(resolveColorMode('dark', true)).toBe('dark');
    expect(resolveColorMode('light', false)).toBe('light');
    expect(resolveColorMode('system', true)).toBe('light');
    expect(resolveColorMode('system', false)).toBe('dark');
  });

  for (const mode of ['dark', 'light'] as ColorMode[]) {
    it.each(colorThemes)(
      `keeps ${mode} $id text and semantic labels readable across surfaces`,
      (theme) => {
        const palette = theme[mode];
        for (const background of [palette.app, palette.surface, palette.raised]) {
          for (const role of [
            'text',
            'muted',
            'dim',
            'accent',
            'blue',
            'green',
            'yellow',
            'danger',
            'merged',
          ] as const) {
            expect(
              contrast(palette[role], background),
              `${theme.id} ${mode} ${role} on ${background}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      },
    );
  }
});
