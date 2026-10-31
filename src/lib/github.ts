import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktop } from './desktop';
import { localCommand as command } from './local-command';
import type { GitHubGateway, GitHubResponse, GitHubOperation } from '../core/github';

export const githubGateway: GitHubGateway = {
  background: isDesktop
    ? {
        configure: (scope) => invoke('background_sync_configure', { scope }),
        refresh: (scope) => invoke('background_sync_refresh', { scope }),
        retryNotifications: (scope) => invoke('background_notification_retry', { scope }),
        subscribe: async (callback) =>
          listen<import('../core/github').BackgroundPacket>('background-sync', (event) =>
            callback(event.payload),
          ),
      }
    : undefined,
  async cachedSession() {
    return command('github_cached_session');
  },
  async cached<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number = 0,
    head = '',
    searchDays = 0,
  ): Promise<GitHubResponse<T> | null> {
    return command('github_cached_request', {
      operation,
      repo,
      accountId,
      number,
      ...(head ? { head } : {}),
      ...(searchDays ? { searchDays } : {}),
    });
  },
  async session() {
    return command('github_session');
  },
  async request<T>(
    operation: GitHubOperation,
    repo: string,
    accountId: number,
    number = 0,
    head = '',
    searchDays = 0,
  ): Promise<GitHubResponse<T>> {
    return command('github_request', {
      operation,
      repo,
      accountId,
      number,
      ...(head ? { head } : {}),
      ...(searchDays ? { searchDays } : {}),
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
