import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { enableDesktopNotifications, notifyDesktop } from './notifications';
vi.mock('./desktop', () => ({ isDesktop: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
describe('desktop notifications', () => {
  it('requests permission only on explicit enabling and exposes a denial', async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue('denied');
    await expect(enableDesktopNotifications()).rejects.toThrow('系统未允许');
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('never requests permission while delivering background updates', async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    await expect(notifyDesktop('ThreadLine', 'Update')).rejects.toThrow('系统通知权限不可用');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('propagates native delivery failures to the app', async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    vi.mocked(invoke).mockRejectedValue(new Error('Delivery failed'));
    await expect(notifyDesktop('ThreadLine', 'Update')).rejects.toThrow('Delivery failed');
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
