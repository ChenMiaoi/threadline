import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './desktop';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

export async function enableDesktopNotifications() {
  if (!isDesktop) throw new Error('桌面通知需要在 ThreadLine 桌面程序中开启。');
  if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted')
    throw new Error('系统未允许 ThreadLine 通知。请在系统通知设置中允许；收件箱气泡仍会正常更新。');
}

export async function notifyDesktop(title: string, body: string) {
  if (!(await isPermissionGranted()))
    throw new Error('系统通知权限不可用，请在通知设置中重新开启桌面通知。');
  await invoke('plugin:notification|notify', { options: { title, body } });
}
