import { clearAvatarCache } from './avatar-cache';
import { isDesktop } from './desktop';
import { localCommand } from './local-command';

export interface StorageUsage {
  programBytes: number;
  programAvailable: boolean;
  dataBytes: number;
  cacheBytes: number;
  runtimeBytes: number;
  webCacheClearable: boolean;
  totalBytes: number;
  incomplete: boolean;
  browserBytes?: number;
}

export async function loadStorageUsage(): Promise<StorageUsage> {
  const usage = await localCommand<StorageUsage>('get_storage_usage');
  if (isDesktop) return usage;
  // Browser storage is an origin-wide estimate, separate from measured preview files.
  try {
    const estimate = await navigator.storage?.estimate();
    return { ...usage, browserBytes: estimate?.usage };
  } catch {
    return usage;
  }
}

export function formatBytes(bytes: number, locale: string) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unit = Math.min(units.length - 1, Math.floor(Math.log2(Math.max(1, bytes)) / 10));
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit ? 1 : 0 }).format(bytes / 1024 ** unit)} ${units[unit]}`;
}

export async function clearCache(kind: 'responses' | 'web-resources' | 'avatars') {
  if (kind === 'avatars') {
    await clearAvatarCache();
  } else await localCommand('clear_cache', { kind });
}
