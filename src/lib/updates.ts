import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isDesktop } from './desktop';
import type { UpdateGateway } from '../core/updates';
import packageInfo from '../../package.json';

export const updateGateway: UpdateGateway = {
  async info() {
    if (!isDesktop) return { version: packageInfo.version, enabled: false, channel: '浏览器预览' };
    const version = await getVersion();
    return {
      version,
      enabled: await invoke<boolean>('updates_configured'),
      channel: version.includes('-') ? '预发布版' : '正式版',
    };
  },
  async check() {
    const update = await check({ timeout: 30_000 });
    if (!update) return null;
    return {
      version: update.version,
      body: update.body,
      async download(progress) {
        let received = 0;
        let total: number | undefined;
        await update.download(
          (event) => {
            if (event.event === 'Started') total = event.data.contentLength;
            if (event.event === 'Progress') received += event.data.chunkLength;
            progress(received, total);
          },
          { timeout: 120_000 },
        );
      },
      install: () => update.install(),
      close: () => update.close(),
    };
  },
  restart: relaunch,
};
