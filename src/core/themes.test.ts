import { describe, expect, it } from 'vitest';
import { colorThemes, resolveColorMode } from './themes';
import { defaultWorkspace, normalizeWorkspace } from './workspace';

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

  it('preserves reference brand colors and distinct canvas layers', () => {
    const nord = colorThemes.find((theme) => theme.id === 'nord')!;
    expect(nord.dark.accent).toBe('#88c0d0');
    expect(nord.light.accent).toBe('#88c0d0');
    expect(nord.dark.canvas).toBe('#2e3440');
    const catppuccin = colorThemes.find((theme) => theme.id === 'catppuccin')!;
    expect(catppuccin.variants).toEqual({ dark: 'Macchiato', light: 'Latte' });
    expect(catppuccin.dark.canvas).toBe('#24273a');
    expect(catppuccin.light.accent).toBe('#8839ef');
    const everforest = colorThemes.find((theme) => theme.id === 'everforest')!;
    expect(everforest.light.accent).toBe('#8da101');
    expect(everforest.light.canvas).toBe('#fdf6e3');
  });
});
