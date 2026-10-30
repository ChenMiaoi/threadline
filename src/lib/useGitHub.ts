import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findLegacyActivityAliases } from '../core/migrate-activity-state';
import { observeUpdates } from '../core/inbox';
import { githubGateway } from './github';
import { assertCacheAccess, isFresh } from './github-cache';
import { useGitHubLogin } from './useGitHubLogin';
import {
  activityFromGitHub,
  issueFromGitHub,
  pullFromGitHub,
  reviewFromGitHub,
  searchRecords,
  type GitHubGateway,
  type GitHubRepository,
  type GitHubSession,
  type SearchPage,
  type SearchRecord,
} from '../core/github';
import type { Activity } from '../features/activity/model';
import type { PullRequest } from '../features/pulls/model';

type Page = 'inbox' | 'authored' | 'review' | 'issues';
interface Snapshot {
  key: string;
  liveReady: boolean;
  pulls: PullRequest[];
  inbox: Activity[];
  review: Activity[];
  issues: Activity[];
  updates: Partial<Record<Page, Activity[]>>;
  sources: Partial<Record<Page, SearchRecord[]>>;
  errors: Partial<Record<Page, string>>;
  times: Partial<Record<Page, number>>;
  limited: Partial<Record<Page, boolean>>;
}
const empty: Snapshot = {
  key: '',
  liveReady: false,
  pulls: [],
  inbox: [],
  review: [],
  issues: [],
  updates: {},
  sources: {},
  errors: {},
  times: {},
  limited: {},
};

export function useGitHub(
  refreshMinutes: number,
  gateway: GitHubGateway = githubGateway,
  initialSearchDays = 0,
) {
  const [searchDays, setSearchDays] = useState(initialSearchDays);
  const [session, setSession] = useState<GitHubSession | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [repo, setRepo] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [syncing, setSyncing] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [picking, setPicking] = useState(false);
  const [repositoryError, setRepositoryError] = useState('');
  const generation = useRef(0);
  const identity = useRef(0);
  const hadSession = useRef(false);
  const inFlight = useRef<{ token: number; force: boolean; promise: Promise<void> } | null>(null);
  const reconnecting = useRef<Promise<void> | null>(null);
  const key = session && repo ? `${session.user.id}:${repo}` : '';
  const scopeKey = searchDays ? `${key}:days:${searchDays}` : key;

  const connect = useCallback(
    async (hydrate = false) => {
      const token = ++identity.current;
      ++generation.current;
      setConnecting(true);
      setPicking(false);
      setRepositoryError('');
      setConnectionError('');
      try {
        if (hydrate && gateway.cachedSession) {
          try {
            const cached = await gateway.cachedSession();
            if (token !== identity.current) return;
            if (cached) {
              hadSession.current = true;
              setSession(cached);
              setRepo(cached.selected ?? '');
            }
          } catch {
            /* The live session supplies authoritative connection errors. */
          }
        }
        const current = await gateway.session();
        if (token !== identity.current) return;
        hadSession.current = true;
        setSession((previous) =>
          previous && JSON.stringify(previous) === JSON.stringify(current) ? previous : current,
        );
        setRepo(current.selected ?? '');
        setRepositories([]);
      } catch (reason) {
        if (token === identity.current) {
          const error = String(reason);
          if (
            /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH|FORBIDDEN|NOT_FOUND)/.test(
              error,
            )
          ) {
            ++generation.current;
            setSession(null);
            setRepo('');
            setSnapshot(empty);
            setRepositories([]);
          }
          const signedOutNormally =
            !hadSession.current &&
            /^(?:Error: )?GH_AUTH_REQUIRED(?:: 请使用 ThreadLine 独立授权登录 GitHub。)?$/.test(
              error.trim(),
            );
          setConnectionError(signedOutNormally ? '' : error);
        }
      } finally {
        if (token === identity.current) {
          setConnecting(false);
          if (inFlight.current?.token !== generation.current) setSyncing(false);
        }
      }
    },
    [gateway],
  );
  const invalidate = useCallback(() => {
    ++identity.current;
    ++generation.current;
  }, []);
  const invalidateRequests = useCallback(() => {
    ++generation.current;
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void connect(true), 0);
    return () => {
      window.clearTimeout(timer);
      invalidate();
    };
  }, [connect, invalidate]);

  const sync = useCallback(
    (force: boolean) => {
      if (!session || !repo) return Promise.resolve();
      if (inFlight.current?.token === generation.current) return inFlight.current.promise;
      const token = ++generation.current;
      setSyncing(true);
      const searchArgs: [number?, string?, number?] = searchDays ? [0, '', searchDays] : [];
      const pages: Page[] = ['authored', 'inbox', 'review', 'issues'];
      let livePages = 0;
      setSnapshot((previous) => ({ ...previous, liveReady: false }));
      const promise = Promise.all(
        pages.map(async (page) => {
          try {
            const operation = page === 'inbox' ? 'activity' : page;
            const apply = (result: import('../core/github').GitHubResponse<SearchPage[]>) => {
              if (token !== generation.current) return;
              assertCacheAccess(result);
              const source = searchRecords(result.payload);
              const records = source.map((r) =>
                page === 'inbox'
                  ? activityFromGitHub(r, session.user.id, repo, session.user.login)
                  : page === 'authored'
                    ? pullFromGitHub(r, session.user.id, repo)
                    : page === 'issues'
                      ? issueFromGitHub(r, session.user.id, repo, session.user.login)
                      : reviewFromGitHub(r, session.user.id, repo, session.user.login),
              );
              setSnapshot((previous) => {
                const current = previous.key === scopeKey ? previous : empty;
                const errors = { ...current.errors };
                if (result.error) errors[page] = result.error;
                else delete errors[page];
                return {
                  ...current,
                  key: scopeKey,
                  limited: {
                    ...current.limited,
                    [page]: result.payload.some((p) => p.data.search.truncated),
                  },
                  sources: { ...current.sources, [page]: source },
                  ...(page !== 'inbox'
                    ? {
                        updates: {
                          ...current.updates,
                          [page]: observeUpdates(
                            source.map((r) =>
                              activityFromGitHub(r, session.user.id, repo, session.user.login),
                            ),
                            current.updates[page] ?? [],
                            result.fetchedAt,
                          ),
                        },
                      }
                    : {}),
                  errors,
                  [page === 'authored' ? 'pulls' : page]:
                    page === 'inbox'
                      ? observeUpdates(records as Activity[], current.inbox, result.fetchedAt)
                      : records,
                  times: { ...current.times, [page]: result.fetchedAt },
                };
              });
            };
            if (!force && gateway.cached) {
              const cached = await gateway
                .cached<SearchPage[]>(operation, repo, session.user.id, ...searchArgs)
                .catch((reason: unknown) => {
                  if (
                    /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH|FORBIDDEN|NOT_FOUND)/.test(
                      String(reason),
                    )
                  )
                    throw reason;
                  return null;
                });
              if (token !== generation.current) return;
              if (cached) {
                apply(cached);
                if (isFresh(cached, (refreshMinutes || 5) * 60_000)) return;
              }
            }
            const result = await gateway.request<SearchPage[]>(
              operation,
              repo,
              session.user.id,
              ...searchArgs,
            );
            if (token !== generation.current) return;
            if (!result.stale && !result.error) ++livePages;
            apply(result);
          } catch (reason) {
            if (token !== generation.current) return;
            const error = String(reason);
            if (
              /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH)/.test(
                error,
              )
            ) {
              ++identity.current;
              ++generation.current;
              setSession(null);
              setRepo('');
              setSnapshot(empty);
              setRepositories([]);
              setConnectionError(error);
              setSyncing(false);
              return;
            }
            if (/GH_(FORBIDDEN|NOT_FOUND)/.test(error)) {
              ++generation.current;
              setSnapshot({
                ...empty,
                key: scopeKey,
                errors: { authored: error, inbox: error, review: error, issues: error },
              });
              setSyncing(false);
              return;
            }
            setSnapshot((previous) => {
              const current = previous.key === scopeKey ? previous : empty;
              return {
                ...current,
                key: scopeKey,
                errors: { ...current.errors, [page]: error },
              };
            });
          }
        }),
      )
        .then(() => {
          if (token === generation.current) {
            setSnapshot((previous) => ({ ...previous, liveReady: livePages === pages.length }));
            if (livePages === pages.length) setConnectionError('');
            setSyncing(false);
          }
        })
        .finally(() => {
          if (inFlight.current?.token === token) inFlight.current = null;
        });
      inFlight.current = { token, force, promise };
      return promise;
    },
    [gateway, session, repo, scopeKey, searchDays, refreshMinutes],
  );
  const refresh = useCallback(() => {
    const pending = inFlight.current;
    if (pending?.token === generation.current && !pending.force && gateway.cached) {
      const token = generation.current;
      return pending.promise.then(() => (token === generation.current ? sync(true) : undefined));
    }
    return sync(true);
  }, [sync, gateway]);
  useEffect(() => {
    const initial = window.setTimeout(() => void sync(false), 0);
    const timer = refreshMinutes
      ? window.setInterval(() => void refresh(), refreshMinutes * 60000)
      : undefined;
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      invalidateRequests();
    };
  }, [refresh, sync, refreshMinutes, invalidateRequests]);

  useEffect(() => {
    function reconnect() {
      if (reconnecting.current) return;
      let recovery: Promise<void>;
      if (session && repo) {
        const pending = inFlight.current;
        const token = generation.current;
        // A pre-reconnect request can still fail after the online event. Wait for it,
        // then try a fresh batch; joining it alone can leave the workspace disconnected.
        recovery =
          pending?.token === token
            ? pending.promise.then(() => (token === generation.current ? sync(true) : undefined))
            : refresh();
      } else if (
        !connecting &&
        /GH_(REQUEST_FAILED|TIMEOUT|RATE_LIMIT|RESPONSE_ERROR)/.test(connectionError)
      )
        recovery = connect(true);
      else return;
      const current = recovery.finally(() => {
        if (reconnecting.current === current) reconnecting.current = null;
      });
      reconnecting.current = current;
    }
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [session, repo, connecting, connectionError, refresh, sync, connect]);

  async function listRepositories() {
    if (!session) return;
    const token = identity.current;
    setPicking(true);
    setRepositoryError('');
    try {
      const result = await gateway.request<GitHubRepository[][]>(
        'repositories',
        '',
        session.user.id,
      );
      if (token === identity.current) {
        if (result.stale) throw new Error(result.error ?? '仓库列表已过期，请重试。');
        setRepositories(result.payload.flat());
      }
    } catch (reason) {
      if (token === identity.current) setRepositoryError(String(reason));
    } finally {
      if (token === identity.current) setPicking(false);
    }
  }
  async function selectRepository(value: string) {
    if (!session) return;
    const token = ++identity.current;
    setConnecting(false);
    setRepositoryError('');
    setPicking(true);
    try {
      await gateway.select(value, session.user.id);
      if (token === identity.current && value !== repo) {
        ++generation.current;
        setRepo(value);
        setSnapshot(empty);
      }
    } catch (reason) {
      if (token === identity.current) setRepositoryError(String(reason));
      throw reason;
    } finally {
      if (token === identity.current) setPicking(false);
    }
  }
  const current = snapshot.key === scopeKey ? snapshot : empty;
  const inbox = useMemo(
    () =>
      /GH_(FORBIDDEN|NOT_FOUND)/.test(current.errors.inbox ?? '')
        ? []
        : [
            ...new Map(
              [...current.inbox, ...Object.values(current.updates).flat()]
                .sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))
                .map((record) => [record.kind + record.number, record]),
            ).values(),
          ].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [current.inbox, current.updates, current.errors.inbox],
  );

  const auth = useGitHubLogin(gateway, connect);
  async function disconnect() {
    try {
      await auth.cancel();
      await gateway.logout();
      invalidate();
      hadSession.current = false;
      setSession(null);
      setRepo('');
      setSnapshot(empty);
      setRepositories([]);
      setConnecting(false);
      setSyncing(false);
      setConnectionError('');
    } catch (reason) {
      setConnectionError((previous) =>
        /GH_(VAULT_INVALID|SECURE_STORAGE)/.test(previous)
          ? `${previous.split('\n')[0]}\n${String(reason)}`
          : String(reason),
      );
    }
  }
  const { sources, ...visible } = current;
  function releaseMigrationSources() {
    if (!Object.keys(sources).length) return;
    setSnapshot((previous) =>
      previous.sources === sources ? { ...previous, sources: {} } : previous,
    );
  }
  function legacyAliases(ids: readonly string[], targets: readonly Activity[]) {
    const selected = new Set(inbox.map((record) => record.id));
    return findLegacyActivityAliases(
      Object.values(sources).flat(),
      targets.filter((target) => selected.has(target.id)),
      ids,
      session?.user.id ?? 0,
      repo,
    );
  }
  return {
    ...visible,
    key,
    searchDays,
    setSearchDays,
    inbox,
    legacyAliases,
    releaseMigrationSources,
    gateway,
    auth,
    disconnect,
    session,
    repo,
    connecting,
    connectionError,
    connect,
    refresh,
    syncing,
    repositories,
    picking,
    repositoryError,
    listRepositories,
    selectRepository,
  };
}
export type GitHubWorkspace = ReturnType<typeof useGitHub>;
