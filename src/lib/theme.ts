import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import {
  getColorTheme,
  resolveColorMode,
  type ColorMode,
  type ColorThemeId,
  type ThemeMode,
} from '../core/themes';

function channels(hex: string) {
  return hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16));
}

function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function blend(color: string, amount: number, background: string) {
  const foreground = channels(color);
  return `#${channels(background)
    .map((value, index) => Math.round(value * (1 - amount) + foreground[index] * amount))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

function readableInk(color: string, backgrounds: string[], mode: ColorMode) {
  const foreground = channels(color);
  const surfaces = backgrounds.map(channels);
  const readable = (candidate: number[]) =>
    surfaces.every((surface) => {
      // Status badges also tint their background with 7% of the foreground.
      const tinted = surface.map((value, index) => value * 0.93 + candidate[index] * 0.07);
      const a = luminance(candidate),
        b = luminance(tinted);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5;
    });
  if (readable(foreground)) return color;
  const target = mode === 'dark' ? 255 : 0;
  for (let step = 1; step <= 100; step++) {
    const candidate = foreground.map((value) =>
      Math.round(value + ((target - value) * step) / 100),
    );
    if (readable(candidate))
      return `#${candidate.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  return mode === 'dark' ? '#ffffff' : '#000000';
}

export function useColorMode(mode: ThemeMode): ColorMode {
  const [systemLight, setSystemLight] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;
    const listener = () => setSystemLight(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  return resolveColorMode(mode, systemLight);
}

export function themeStyle(id: ColorThemeId, mode: ColorMode, gradient: boolean): CSSProperties {
  const palette = getColorTheme(id)[mode];
  const mix = (color: string, amount: number, background = palette.surface) =>
    `color-mix(in srgb, ${color} ${amount}%, ${background})`;
  const style: Record<string, string> = { colorScheme: mode };
  for (const [role, value] of Object.entries(palette)) style[`--${role}`] = value;
  // Keep source colors intact for fills, charts and swatches. Adjust only ink.
  const backgrounds = [palette.app, palette.canvas, palette.surface, palette.raised];
  if (gradient) {
    backgrounds.push(
      blend(palette.accent, 0.14, palette.canvas),
      blend(palette.blue, 0.09, palette.canvas),
      blend(palette.accent, 0.06, palette.surface),
    );
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
    style[`--${role}-ink`] = readableInk(palette[role], backgrounds, mode);
  }
  Object.assign(style, {
    '--on-accent': luminance(channels(palette.accent)) > 0.179 ? '#000000' : '#ffffff',
    '--focus-ring': style['--accent-ink'],
    '--danger-fill': style['--danger-ink'],
    '--on-danger': luminance(channels(style['--danger-ink'])) > 0.179 ? '#000000' : '#ffffff',
    '--hover': mix(palette.text, 7, palette.raised),
    '--border': mix(palette.text, mode === 'dark' ? 9 : 14),
    '--avatar-bg': mix(palette.accent, 15, palette.raised),
    '--error': style['--danger-ink'],
    '--error-border': mix(palette.danger, 50),
    '--diff-added': mix(palette.green, 12),
    '--diff-removed': mix(palette.danger, 12),
    '--heat-0': mix(palette.text, 7),
    '--heat-1': mix(palette.accent, 25),
    '--heat-2': mix(palette.accent, 45),
    '--heat-3': mix(palette.accent, 70),
    '--heat-4': palette.accent,
    '--syntax-keyword': style['--danger-ink'],
    '--syntax-string': style['--green-ink'],
    '--syntax-function': style['--merged-ink'],
    '--syntax-type': style['--blue-ink'],
    '--syntax-number': style['--accent-ink'],
    '--syntax-attribute': style['--yellow-ink'],
    '--syntax-comment': style['--dim-ink'],
    '--content-bg': gradient
      ? `linear-gradient(135deg, ${mix(palette.accent, 14, palette.canvas)} 0%, ${palette.canvas} 50%, ${mix(palette.blue, 9, palette.canvas)} 100%)`
      : palette.canvas,
    '--discussion-bg': gradient
      ? `linear-gradient(165deg, ${mix(palette.accent, 6)}, ${palette.surface} 80%)`
      : palette.surface,
  });
  style['--toggle-thumb'] =
    [palette.surface, palette.app].find((color) => {
      const a = luminance(channels(color));
      const b = luminance(channels(palette.accent));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 3;
    }) ?? style['--on-accent'];
  return style as CSSProperties;
}
