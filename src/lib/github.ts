import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './desktop';
import type { GitHubGateway, GitHubResponse, GitHubOperation } from '../core/github';

function desktopOnly() {
  if (!isDesktop)
    throw new Error('请在 ThreadLine 桌面应用中连接 GitHub。浏览器预览不访问本机 gh。');
}
export const githubGateway: GitHubGateway = {
  async session() {
    desktopOnly();
    return invoke('github_session');
  },
  async request<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number = 0,
  ): Promise<GitHubResponse<T>> {
    desktopOnly();
    return invoke('github_request', { operation, repo, accountId, number });
  },
  async select(repo, accountId) {
    desktopOnly();
    return invoke('github_select_repository', { repo, accountId });
  },
  async login() {
    desktopOnly();
    return invoke('github_login');
  },
  async open(url) {
    desktopOnly();
    return invoke('github_open', { url });
  },
};
