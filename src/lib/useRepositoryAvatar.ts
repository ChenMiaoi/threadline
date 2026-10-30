import { useEffect, useState } from 'react';
import type { GitHubGateway } from '../core/github';

interface RepositoryOwner {
  owner?: { avatar_url?: string | null };
}

export function useRepositoryAvatar(gateway: GitHubGateway, repo: string, accountId?: number) {
  const key = `${accountId}:${repo}`;
  const [avatar, setAvatar] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!repo || accountId === undefined) return;
    const account = accountId;
    let active = true;
    async function load() {
      try {
        const cached = await gateway.cached?.<RepositoryOwner>('repository', repo, account);
        if (active && cached?.payload.owner?.avatar_url) {
          setAvatar({ key, url: cached.payload.owner.avatar_url });
        }
      } catch {
        /* Repository metadata remains available through the live request. */
      }
      try {
        const result = await gateway.request<RepositoryOwner>('repository', repo, account);
        if (active) setAvatar({ key, url: result.payload.owner?.avatar_url ?? null });
      } catch {
        /* Keep the cached avatar or the owner's initial when offline. */
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [gateway, repo, accountId, key]);
  return avatar?.key === key ? avatar.url : null;
}
