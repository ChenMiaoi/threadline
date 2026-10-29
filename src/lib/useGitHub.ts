import { useCallback, useEffect, useRef, useState } from 'react';
import { githubGateway } from './github';
import {
  issueFromGitHub,
  notificationFromGitHub,
  pullFromGitHub,
  reviewFromGitHub,
  searchRecords,
  type GitHubGateway,
  type GitHubNotification,
  type GitHubRepository,
  type GitHubSession,
  type SearchPage,
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
  errors: Partial<Record<Page, string>>;
  times: Partial<Record<Page, number>>;
}
const empty: Snapshot = {
  key: '',
  pulls: [],
  inbox: [],
  review: [],
  issues: [],
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
  const key = session && repo ? `${session.user.id}:${repo}` : '';

  const connect = useCallback(async () => {
    const token = ++identity.current;
    ++generation.current;
    setConnecting(true);
    setSession(null);
    setRepo('');
    setSnapshot(empty);
    setRepositories([]);
    setConnectionError('');
    try {
      const current = await gateway.session();
      if (token !== identity.current) return;
      setSession(current);
      setRepo(current.selected ?? '');
    } catch (reason) {
      if (token === identity.current) setConnectionError(String(reason));
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

  const refresh = useCallback(async () => {
    if (!session || !repo) return;
    const token = ++generation.current;
    setSyncing(true);
    const pages = ['authored', 'inbox', 'review', 'issues'] as const;
    const results = await Promise.allSettled(
      pages.map(async (page) => {
        if (page === 'inbox') {
          const result = await gateway.request<GitHubNotification[][]>(page, repo, session.user.id);
          return {
            page,
            result,
            records: result.payload
              .flat()
              .filter(
                (n) =>
                  ['PullRequest', 'Issue'].includes(n.subject.type) &&
                  n.repository.full_name.toLowerCase() === repo.toLowerCase() &&
                  /\/(pulls|issues)\/\d+$/.test(n.subject.url ?? ''),
              )
              .map((n) => notificationFromGitHub(n, session.user.id)),
          };
        }
        const result = await gateway.request<SearchPage[]>(page, repo, session.user.id);
        const records = searchRecords(result.payload);
        return {
          page,
          result,
          records:
            page === 'authored'
              ? records.map((r) => pullFromGitHub(r, session.user.id, repo))
              : page === 'issues'
                ? records.map((r) => issueFromGitHub(r, session.user.id, repo, session.user.login))
                : records.map((r) =>
                    reviewFromGitHub(r, session.user.id, repo, session.user.login),
                  ),
        };
      }),
    );
    if (token !== generation.current) return;
    const lostSession = results.find(
      (result) =>
        result.status === 'rejected' &&
        /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED)/.test(String(result.reason)),
    );
    if (lostSession?.status === 'rejected') {
      ++identity.current;
      setSession(null);
      setRepo('');
      setSnapshot(empty);
      setRepositories([]);
      setConnectionError(String(lostSession.reason));
      setSyncing(false);
      return;
    }
    setSnapshot((previous) => {
      const next: Snapshot = {
        ...(previous.key === key ? previous : empty),
        key,
        errors: {},
        times: { ...(previous.key === key ? previous.times : {}) },
      };
      results.forEach((result, index) => {
        const page = pages[index];
        if (result.status === 'rejected') {
          const error = String(result.reason);
          next.errors[page] = error;
          if (/GH_(FORBIDDEN|AUTH_REQUIRED|NOT_FOUND|ACCOUNT_CHANGED)/.test(error)) {
            if (page === 'authored') next.pulls = [];
            else next[page] = [];
          }
        } else {
          if (page === 'authored') next.pulls = result.value.records as PullRequest[];
          else next[page] = result.value.records as Activity[];
          if (result.value.result.error) next.errors[page] = result.value.result.error;
          next.times[page] = result.value.result.fetchedAt;
        }
      });
      return next;
    });
    setSyncing(false);
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
      if (token === identity.current) {
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
  return {
    ...current,
    gateway,
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
