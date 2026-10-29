import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ desktop: false }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => host.desktop }));

afterEach(() => vi.unstubAllGlobals());

describe('native macOS window layout', () => {
  it.each([
    [true, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', true],
    [false, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', false],
    [true, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false],
    [true, 'Mozilla/5.0 (X11; Linux x86_64)', false],
  ])('uses native controls for desktop=%s and %s', async (desktop, userAgent, expected) => {
    vi.resetModules();
    host.desktop = desktop;
    vi.stubGlobal('navigator', { userAgent });
    expect((await import('./desktop')).isMacDesktop).toBe(expected);
  });
});
