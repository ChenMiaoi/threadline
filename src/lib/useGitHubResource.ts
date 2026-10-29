import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GitHubGateway, GitHubOperation, GitHubResponse } from '../core/github';

export interface PerformanceSample {
  operation: GitHubOperation;
  source: 'memory' | 'network';
  requestMs: number;
  uiCommitMs: number;
  timing?: GitHubResponse<unknown>['timing'];
}
export interface ResourceCache {
  scope: string;
  samples: PerformanceSample[];
  responses: Map<string, GitHubResponse<unknown>>;
  pending: Map<string, Promise<GitHubResponse<unknown>>>;
}
export function createResourceCache(scope = ''): ResourceCache {
  return { scope, samples: [], responses: new Map(), pending: new Map() };
}
export function invalidateRecord(
  cache: ResourceCache,
  account: number,
  repo: string,
  number: number,
) {
  const prefix = `${cache.scope}:${account}:${repo}:${number}:`;
  for (const key of cache.responses.keys()) if (key.startsWith(prefix)) cache.responses.delete(key);
}
export function useGitHubResource<T>(
  gateway: GitHubGateway,
  cache: ResourceCache,
  operation: GitHubOperation,
  repo: string,
  account: number,
  number: number,
  head = '',
  enabled = true,
) {
  const key = `${cache.scope}:${account}:${repo}:${number}:${operation}:${head}`;
  const [mountedAt] = useState(() => performance.now());
  const cachedRecorded = useRef(false);
  const [state, setState] = useState(() => ({
    key,
    response: cache.responses.get(key) as GitHubResponse<T> | undefined,
    error: '',
    loading: true,
    receivedAt: 0,
    requestMs: 0,
  }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const started = performance.now();
    let pending = cache.pending.get(key);
    if (!pending) {
      pending = gateway.request(operation, repo, account, number, head);
      cache.pending.set(key, pending);
      const current = pending;
      void pending
        .then(
          (response) => {
            cache.responses.delete(key);
            cache.responses.set(key, response);
            if (cache.responses.size > 24)
              cache.responses.delete(cache.responses.keys().next().value!);
          },
          (reason) => {
            if (/GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|FORBIDDEN|NOT_FOUND)/.test(String(reason)))
              cache.responses.clear();
            else if (/GH_HEAD_CHANGED/.test(String(reason)))
              invalidateRecord(cache, account, repo, number);
          },
        )
        .finally(() => {
          if (cache.pending.get(key) === current) cache.pending.delete(key);
        });
    }
    void pending.then(
      (response) => {
        if (active)
          setState({
            key,
            response: response as GitHubResponse<T>,
            error: response.error ?? '',
            loading: false,
            receivedAt: performance.now(),
            requestMs: performance.now() - started,
          });
      },
      (reason) => {
        if (active)
          setState((previous) => ({
            ...previous,
            key,
            response: /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|FORBIDDEN|NOT_FOUND|HEAD_CHANGED)/.test(
              String(reason),
            )
              ? undefined
              : previous.key === key
                ? previous.response
                : (cache.responses.get(key) as GitHubResponse<T> | undefined),
            error: String(reason),
            loading: false,
          }));
      },
    );
    return () => {
      active = false;
    };
  }, [gateway, cache, operation, repo, account, number, head, key, attempt, enabled]);
  useLayoutEffect(() => {
    if (state.key !== key || !state.response || state.error) return;
    if (state.loading) {
      if (state.receivedAt !== 0 || cachedRecorded.current) return;
      cachedRecorded.current = true;
      cache.samples.push({
        operation,
        source: 'memory',
        requestMs: 0,
        uiCommitMs: performance.now() - mountedAt,
      });
    } else {
      cache.samples.push({
        operation,
        source: 'network',
        requestMs: state.requestMs,
        uiCommitMs: performance.now() - state.receivedAt,
        timing: state.response.timing,
      });
    }
    if (cache.samples.length > 24) cache.samples.shift();
  }, [cache, operation, key, state, mountedAt]);
  function retry() {
    setState((previous) => ({ ...previous, error: '', loading: true }));
    setAttempt((value) => value + 1);
  }
  const current =
    state.key === key
      ? state
      : {
          response: cache.responses.get(key) as GitHubResponse<T> | undefined,
          error: '',
          loading: true,
        };
  return { response: current.response, error: current.error, loading: current.loading, retry };
}
