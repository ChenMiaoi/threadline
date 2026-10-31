import { expect, it } from 'vitest';
import { themeStyle } from './theme';
import { colorThemes } from '../core/themes';

it.each(colorThemes)(
  'applies $id colors to code, statuses, heatmaps, and optional gradients',
  (theme) => {
    for (const mode of ['dark', 'light'] as const) {
      const flat = themeStyle(theme.id, mode, false) as Record<string, string>;
      const gradient = themeStyle(theme.id, mode, true) as Record<string, string>;
      expect(flat.colorScheme).toBe(mode);
      expect(flat['--content-bg']).toBe(theme[mode].surface);
      expect(gradient['--content-bg']).toContain('linear-gradient');
      expect(gradient['--discussion-bg']).toContain('linear-gradient');
      for (const key of [
        '--danger',
        '--merged',
        '--syntax-keyword',
        '--syntax-string',
        '--syntax-comment',
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
