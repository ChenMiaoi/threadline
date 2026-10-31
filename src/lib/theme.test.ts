import { expect, it } from 'vitest';
import { themeStyle } from './theme';
import { colorThemes } from '../core/themes';

function rgb(hex: string) {
  return hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16));
}

function luminance(channels: number[]) {
  const linear = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

it.each(colorThemes)('keeps $id source colors while rendering readable text', (theme) => {
  for (const mode of ['dark', 'light'] as const) {
    const palette = theme[mode];
    const original = structuredClone(palette);
    for (const gradient of [false, true]) {
      const style = themeStyle(theme.id, mode, gradient) as Record<string, string>;
      expect(style['--focus-ring']).toBe(style['--accent-ink']);
      expect(style['--danger-fill']).toBe(style['--danger-ink']);
      const toggleLuminances = [
        luminance(rgb(style['--toggle-thumb'])),
        luminance(rgb(palette.accent)),
      ].sort((a, b) => b - a);
      expect((toggleLuminances[0] + 0.05) / (toggleLuminances[1] + 0.05)).toBeGreaterThanOrEqual(3);
      const dangerLuminances = [
        luminance(rgb(style['--on-danger'])),
        luminance(rgb(style['--danger-fill'])),
      ].sort((a, b) => b - a);
      expect((dangerLuminances[0] + 0.05) / (dangerLuminances[1] + 0.05)).toBeGreaterThanOrEqual(
        4.5,
      );
      const badgeLuminances = [
        luminance(rgb(style['--on-accent'])),
        luminance(rgb(palette.accent)),
      ].sort((a, b) => b - a);
      expect((badgeLuminances[0] + 0.05) / (badgeLuminances[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
      const surfaces = [palette.app, palette.canvas, palette.surface, palette.raised].map(rgb);
      if (gradient) {
        for (const [color, amount, background] of [
          [palette.accent, 0.14, palette.canvas],
          [palette.blue, 0.09, palette.canvas],
          [palette.accent, 0.06, palette.surface],
        ] as const) {
          surfaces.push(
            rgb(background).map((value, index) =>
              Math.round(value * (1 - amount) + rgb(color)[index] * amount),
            ),
          );
        }
      }
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
        expect(style[`--${role}`]).toBe(palette[role]);
        const ink = rgb(style[`--${role}-ink`]);
        for (const surface of surfaces) {
          for (const tint of [0, 0.07]) {
            const background = surface.map(
              (value, index) => value * (1 - tint) + ink[index] * tint,
            );
            const values = [luminance(ink), luminance(background)].sort((a, b) => b - a);
            expect(
              (values[0] + 0.05) / (values[1] + 0.05),
              `${theme.id} ${mode} ${role} on ${surface}, tint ${tint}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
    expect(palette).toEqual(original);
  }
});

it('adapts text without washing out Nord fills or Catppuccin accents', () => {
  const nord = themeStyle('nord', 'light', false) as Record<string, string>;
  expect(nord['--accent']).toBe('#88c0d0');
  expect(nord['--accent-ink']).not.toBe(nord['--accent']);
  const catppuccin = themeStyle('catppuccin', 'dark', false) as Record<string, string>;
  expect(catppuccin['--accent']).toBe('#c6a0f6');
  expect(catppuccin['--accent-ink']).toBe('#c6a0f6');
});

it.each(colorThemes)(
  'applies $id colors to code, statuses, heatmaps, and optional gradients',
  (theme) => {
    for (const mode of ['dark', 'light'] as const) {
      const flat = themeStyle(theme.id, mode, false) as Record<string, string>;
      const gradient = themeStyle(theme.id, mode, true) as Record<string, string>;
      expect(flat.colorScheme).toBe(mode);
      expect(flat['--content-bg']).toBe(theme[mode].canvas);
      expect(flat['--heat-4']).toBe(theme[mode].accent);
      expect(flat['--green']).toBe(theme[mode].green);
      for (const level of [1, 2, 3]) {
        expect(flat[`--heat-${level}`]).toContain(theme[mode].accent);
        expect(flat[`--heat-${level}`]).toContain(theme[mode].surface);
      }
      expect(gradient['--content-bg']).toContain('linear-gradient');
      expect(gradient['--discussion-bg']).toContain('linear-gradient');
      expect(gradient['--content-bg']).toContain(`${theme[mode].accent} 14%`);
      expect(gradient['--content-bg']).toContain(`${theme[mode].blue} 9%`);
      for (const style of [flat, gradient]) {
        expect(style['--syntax-keyword']).toBe(style['--danger-ink']);
        expect(style['--syntax-string']).toBe(style['--green-ink']);
        expect(style['--syntax-comment']).toBe(style['--dim-ink']);
      }
      for (const key of [
        '--danger',
        '--merged',
        '--diff-added',
        '--diff-removed',
        '--heat-0',
        '--heat-1',
        '--heat-2',
        '--heat-3',
        '--heat-4',
      ]) {
        expect(flat[key], key).toBeTruthy();
        expect(flat[key]).toBe(gradient[key]);
      }
    }
  },
);
