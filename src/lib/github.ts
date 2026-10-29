import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './desktop';
import type { GitHubGateway, GitHubResponse, GitHubOperation } from '../core/github';

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktop) return invoke<T>(name, args);
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
export const githubGateway: GitHubGateway = {
  async session() {
    return command('github_session');
  },
  async request<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number = 0,
    head = '',
  ): Promise<GitHubResponse<T>> {
    return command('github_request', {
      operation,
      repo,
      accountId,
      number,
      ...(head ? { head } : {}),
    });
  },
  async select(repo, accountId) {
    return command('github_select_repository', { repo, accountId });
  },
  async login() {
    return command('github_login');
  },
  async loginStatus() {
    return command('github_login_status');
  },
  async cancelLogin() {
    return command('github_login_cancel');
  },
  async logout() {
    return command('github_logout');
  },
  async open(url) {
    return command('github_open', { url });
  },
};
