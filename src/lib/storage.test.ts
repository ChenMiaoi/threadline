import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localCommand } from './local-command';
import { formatBytes, loadStorageUsage } from './storage';
const host = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('./desktop', () => host);
vi.mock('./local-command', () => ({ localCommand: vi.fn() }));
const usage = {
  programBytes: 7,
  programAvailable: true,
  dataBytes: 11,
  runtimeBytes: 0,
  webCacheClearable: false,
  cacheBytes: 13,
  totalBytes: 31,
  incomplete: false,
};
beforeEach(() => {
  host.isDesktop = true;
  vi.mocked(localCommand).mockReset().mockResolvedValue(usage);
});
afterEach(() => vi.unstubAllGlobals());
describe('storage usage', () => {
  it('keeps browser estimates separate and tolerates unsupported browser storage', async () => {
    host.isDesktop = false;
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn().mockResolvedValue({ usage: 123 }) },
    });
    await expect(loadStorageUsage()).resolves.toEqual({ ...usage, browserBytes: 123 });
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn().mockRejectedValue(new Error('unavailable')) },
    });
    await expect(loadStorageUsage()).resolves.toEqual(usage);
  });
  it('uses measured native data without exposing paths or requesting browser access', async () => {
    await expect(loadStorageUsage()).resolves.toEqual(usage);
    expect(localCommand).toHaveBeenCalledWith('get_storage_usage');
  });
  it('formats zero and large file sizes with binary units', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(1024, 'en')).toBe('1 KiB');
    expect(formatBytes(1.5 * 1024 ** 3, 'en')).toBe('1.5 GiB');
  });
});
