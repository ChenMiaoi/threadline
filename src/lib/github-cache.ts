import type { GitHubOperation, GitHubResponse } from '../core/github';

export function isFresh(response: GitHubResponse<unknown>, ttl: number) {
  const age = Date.now() - response.fetchedAt;
  return !response.stale && !response.error && age >= 0 && age < ttl;
}

export function resourceTtl(operation: GitHubOperation, number: number, head: string) {
  if (operation === 'checks') return 30_000;
  if (operation === 'files' && head) return 10 * 60_000;
  if (operation === 'profile')
    return number === new Date().getUTCFullYear() ? 15 * 60_000 : 24 * 60 * 60_000;
  return 2 * 60_000;
}

export function assertCacheAccess(response: GitHubResponse<unknown> | null) {
  if (
    response?.error &&
    /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH|FORBIDDEN|NOT_FOUND|HEAD_CHANGED)/.test(
      response.error,
    )
  )
    throw new Error(response.error);
  return response;
}

export function isResourceFresh(
  response: GitHubResponse<unknown>,
  ttl: number,
  minFetchedAt: number,
  expectedHead: string,
) {
  if (!isFresh(response, ttl) || response.fetchedAt < minFetchedAt) return false;
  if (!expectedHead) return true;
  const payload = response.payload as { pull?: { head?: { sha?: string } } } | null;
  return payload?.pull?.head?.sha === expectedHead;
}
