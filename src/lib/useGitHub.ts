import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findLegacyActivityAliases } from '../core/migrate-activity-state';
import { observeUpdates } from '../core/inbox';
import { githubGateway } from './github';
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
  pulls: PullRequest[];
  inbox: Activity[];
  review: Activity[];
  issues: Activity[];
  updates: Partial<Record<Page, Activity[]>>;
  sources: Partial<Record<Page, SearchRecord[]>>;
  errors: Partial<Record<Page, string>>;
  times: Partial<Record<Page, number>>;
}
const empty: Snapshot = {
  key: '',
  pulls: [],
  inbox: [],
  review: [],
  issues: [],
  updates: {},
  sources: {},
  errors: {},
  times: {},
};

export function useGitHub(refreshMinutes: number, gateway: GitHubGateway = githubGateway) {
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
  const inFlight = useRef<{ token: number; promise: Promise<void> } | null>(null);
  const key = session && repo ? `${session.user.id}:${repo}` : '';

  const connect = useCallback(async () => {
    const token = ++identity.current;
    ++generation.current;
    setConnecting(true);
    setPicking(false);
    setRepositoryError('');
    setConnectionError('');
    try {
      const current = await gateway.session();
      if (token !== identity.current) return;
      setSession(current);
      setRepo(current.selected ?? '');
      setRepositories([]);
    } catch (reason) {
      if (token === identity.current) {
        const error = String(reason);
        if (/GH_(AUTH_REQUIRED|ACCOUNT_CHANGED)/.test(error)) {
          setSession(null);
          setRepo('');
          setSnapshot(empty);
          setRepositories([]);
        }
        setConnectionError(error);
      }
    } finally {
      if (token === identity.current) {
        setConnecting(false);
        setSyncing(false);
      }
    }
  }, [gateway]);
  const invalidate = useCallback(() => {
    ++identity.current;
    ++generation.current;
  }, []);
  const invalidateRequests = useCallback(() => {
    ++generation.current;
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void connect(), 0);
    return () => {
      window.clearTimeout(timer);
      invalidate();
    };
  }, [connect, invalidate]);

  const refresh = useCallback(() => {
    if (!session || !repo) return Promise.resolve();
    if (inFlight.current?.token === generation.current) return inFlight.current.promise;
    const token = ++generation.current;
    setSyncing(true);
    const pages: Page[] = ['authored', 'inbox', 'review', 'issues'];
    const promise = Promise.all(
      pages.map(async (page) => {
        try {
          const result = await gateway.request<SearchPage[]>(
            page === 'inbox' ? 'activity' : page,
            repo,
            session.user.id,
          );
          if (token !== generation.current) return;
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
            const current = previous.key === key ? previous : empty;
            const errors = { ...current.errors };
            if (result.error) errors[page] = result.error;
            else delete errors[page];
            return {
              ...current,
              key,
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
        } catch (reason) {
          if (token !== generation.current) return;
          const error = String(reason);
          if (/GH_(AUTH_REQUIRED|ACCOUNT_CHANGED)/.test(error)) {
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
          setSnapshot((previous) => {
            const current = previous.key === key ? previous : empty;
            return {
              ...current,
              key,
              errors: { ...current.errors, [page]: error },
              ...(/GH_(FORBIDDEN|NOT_FOUND)/.test(error)
                ? {
                    [page === 'authored' ? 'pulls' : page]: [],
                    updates: { ...current.updates, [page]: [] },
                    sources: { ...current.sources, [page]: [] },
                  }
                : {}),
            };
          });
        }
      }),
    )
      .then(() => {
        if (token === generation.current) setSyncing(false);
      })
      .finally(() => {
        if (inFlight.current?.token === token) inFlight.current = null;
      });
    inFlight.current = { token, promise };
    return promise;
  }, [gateway, session, repo, key]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = refreshMinutes
      ? window.setInterval(() => void refresh(), refreshMinutes * 60000)
      : undefined;
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      invalidateRequests();
    };
  }, [refresh, refreshMinutes, invalidateRequests]);

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
    const token = identity.current;
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
  const current = snapshot.key === key ? snapshot : empty;
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
