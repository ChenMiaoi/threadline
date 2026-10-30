import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { enableDesktopNotifications, notifyDesktop } from './notifications';
const host = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('./desktop', () => host);
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  host.isDesktop = true;
});
describe('desktop notifications', () => {
  it('rejects browser delivery before calling native notification APIs', async () => {
    host.isDesktop = false;
    await expect(notifyDesktop('ThreadLine', 'Update')).rejects.toThrow('桌面程序');
    await expect(enableDesktopNotifications()).rejects.toThrow('桌面程序');
    expect(isPermissionGranted).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
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
