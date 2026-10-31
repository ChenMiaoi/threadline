import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import {
  getColorTheme,
  resolveColorMode,
  type ColorMode,
  type ColorThemeId,
  type ThemeMode,
} from '../core/themes';

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
  Object.assign(style, {
    '--hover': mix(palette.text, 7, palette.raised),
    '--border': mix(palette.text, mode === 'dark' ? 16 : 20),
    '--avatar-bg': mix(palette.accent, 15, palette.raised),
    '--error': palette.danger,
    '--error-border': mix(palette.danger, 50),
    '--diff-added': mix(palette.green, 12),
    '--diff-removed': mix(palette.danger, 12),
    '--heat-0': mix(palette.text, 7),
    '--heat-1': mix(palette.green, 25),
    '--heat-2': mix(palette.green, 45),
    '--heat-3': mix(palette.green, 70),
    '--heat-4': palette.green,
    '--syntax-keyword': palette.danger,
    '--syntax-string': palette.green,
    '--syntax-function': palette.merged,
    '--syntax-type': palette.blue,
    '--syntax-number': palette.accent,
    '--syntax-attribute': palette.yellow,
    '--syntax-comment': palette.dim,
    '--content-bg': gradient
      ? `linear-gradient(135deg, ${mix(palette.accent, 5)}, ${palette.surface} 65%)`
      : palette.surface,
    '--discussion-bg': gradient
      ? `linear-gradient(165deg, ${mix(palette.accent, 6, palette.raised)}, ${palette.surface} 80%)`
      : palette.surface,
  });
  return style as CSSProperties;
}
