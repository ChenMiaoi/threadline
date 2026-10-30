import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './desktop';

export async function localCommand<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktop)
    return invoke<T>(
      name,
      name === 'github_request' || name === 'github_cached_request' ? { request: args } : args,
    );
  if (!import.meta.env.DEV) throw new Error('请在 ThreadLine 桌面应用中连接 GitHub。');
  const response = await fetch('/__threadline/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Threadline-Preview': '1' },
    body: JSON.stringify({ command: name, args: args ?? {} }),
  });
  const result: { ok: boolean; value: T; error: string } = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || '本地 GitHub 连接失败');
  return result.value;
}
