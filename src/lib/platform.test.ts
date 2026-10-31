import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ desktop: false }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => host.desktop }));

afterEach(() => vi.unstubAllGlobals());

describe('macOS host detection', () => {
  it.each([
    [true, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', true],
    [false, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', false],
    [true, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false],
    [true, 'Mozilla/5.0 (X11; Linux x86_64)', false],
  ])(
    'detects the desktop host separately from the macOS appearance for desktop=%s and %s',
    async (desktop, userAgent, expected) => {
      vi.resetModules();
      host.desktop = desktop;
      vi.stubGlobal('navigator', { userAgent });
      const platform = await import('./desktop');
      expect(platform.isMacDesktop).toBe(expected);
      expect(platform.isMacOS).toBe(userAgent.includes('Macintosh'));
    },
  );
});
