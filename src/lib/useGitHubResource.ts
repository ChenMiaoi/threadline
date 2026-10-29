import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { assertCacheAccess, isResourceFresh, resourceTtl } from './github-cache';
import type { GitHubGateway, GitHubOperation, GitHubResponse } from '../core/github';

export interface PerformanceSample {
  operation: GitHubOperation;
  source: 'memory' | 'disk' | 'network';
  requestMs: number;
  uiCommitMs: number;
  timing?: GitHubResponse<unknown>['timing'];
}
interface PendingResource {
  promise: Promise<GitHubResponse<unknown>>;
  hydration?: Promise<GitHubResponse<unknown> | null>;
  source?: 'disk' | 'network';
  minFetchedAt?: number;
  expectedHead?: string;
  invalidated: string;
  invalidate(reason: string): void;
}
function pendingResource(request: Promise<GitHubResponse<unknown>>): PendingResource {
  let rejectInvalidated!: (reason: string) => void;
  const promise = new Promise<GitHubResponse<unknown>>((resolve, reject) => {
    rejectInvalidated = reject;
    void request.then(resolve, reject);
  });
  const pending: PendingResource = {
    promise,
    invalidated: '',
    invalidate(reason) {
      pending.invalidated = reason;
      rejectInvalidated(reason);
    },
  };
  return pending;
}
export interface ResourceCache {
  scope: string;
  samples: PerformanceSample[];
  responses: Map<string, GitHubResponse<unknown>>;
  invalidated: Set<string>;
  pending: Map<string, PendingResource>;
}
export function createResourceCache(scope = ''): ResourceCache {
  return { scope, samples: [], responses: new Map(), pending: new Map(), invalidated: new Set() };
}
export function invalidateRecord(
  cache: ResourceCache,
  account: number,
  repo: string,
  number: number,
) {
  const prefix = `${cache.scope}:${account}:${repo}:${number}:`;
  cache.invalidated.add(prefix);
  invalidateResources(cache, 'GH_HEAD_CHANGED', prefix);
}
function invalidateResources(cache: ResourceCache, reason: string, prefix = '') {
  cache.invalidated.add(prefix);
  for (const key of cache.responses.keys()) if (key.startsWith(prefix)) cache.responses.delete(key);
  for (const [key, pending] of cache.pending) {
    if (!key.startsWith(prefix)) continue;
    cache.pending.delete(key);
    pending.invalidate(reason);
  }
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
  minFetchedAt = 0,
  expectedHead = '',
) {
  const key = `${cache.scope}:${account}:${repo}:${number}:${operation}:${head}`;
  const validationKey = `${key}:${minFetchedAt}:${expectedHead}`;
  const [mountedAt] = useState(() => performance.now());
  const cachedRecorded = useRef(false);
  const [state, setState] = useState(() => ({
    key,
    response: cache.responses.get(key) as GitHubResponse<T> | undefined,
    error: '',
    loading: true,
    receivedAt: 0,
    requestMs: 0,
    source: 'memory' as PerformanceSample['source'],
    validationKey,
  }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const started = performance.now();
    const ttl = resourceTtl(operation, number, head);
    const fresh = (response: GitHubResponse<unknown>) =>
      isResourceFresh(response, ttl, minFetchedAt, expectedHead);
    const memory = cache.responses.get(key);
    if (attempt === 0 && memory && fresh(memory)) {
      void Promise.resolve().then(() => {
        if (active)
          setState({
            key,
            response: memory as GitHubResponse<T>,
            error: '',
            loading: false,
            receivedAt: 0,
            requestMs: 0,
            source: 'memory',
            validationKey,
          });
      });
      return () => {
        active = false;
      };
    }
    void Promise.resolve().then(() => {
      if (active)
        setState((previous) => ({
          ...previous,
          key,
          response: previous.key === key ? previous.response : undefined,
          error: '',
          loading: true,
        }));
    });
    let pending = cache.pending.get(key);
    if (
      pending &&
      ((attempt > 0 && pending.hydration) ||
        (pending.minFetchedAt ?? 0) < minFetchedAt ||
        pending.expectedHead !== expectedHead)
    ) {
      cache.pending.delete(key);
      pending.invalidate('GH_REFRESH_REQUIRED');
      pending = undefined;
    }
    if (!pending) {
      const canHydrate =
        attempt === 0 &&
        !memory &&
        ![...cache.invalidated].some((prefix) => key.startsWith(prefix));
      const hydration =
        canHydrate && gateway.cached
          ? gateway
              .cached(operation, repo, account, number, head)
              .then((response) => {
                assertCacheAccess(response);
                return response;
              })
              .catch((reason: unknown) => {
                if (
                  /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH|FORBIDDEN|NOT_FOUND)/.test(
                    String(reason),
                  )
                )
                  throw reason;
                return null;
              })
          : Promise.resolve(null);
      pending = pendingResource(
        canHydrate && gateway.cached
          ? hydration.then((cached) => {
              if (cached && fresh(cached)) return cached;
              return gateway.request(operation, repo, account, number, head).then((response) => {
                assertCacheAccess(response);
                return response;
              });
            })
          : gateway.request(operation, repo, account, number, head).then((response) => {
              assertCacheAccess(response);
              return response;
            }),
      );
      pending.hydration = hydration;
      pending.minFetchedAt = minFetchedAt;
      pending.expectedHead = expectedHead;
      cache.pending.set(key, pending);
      const current = pending;
      void pending.promise
        .then(
          (response) => {
            if (cache.pending.get(key) !== current) return;
            cache.responses.delete(key);
            cache.responses.set(key, response);
            if (cache.responses.size > 24)
              cache.responses.delete(cache.responses.keys().next().value!);
          },
          (reason) => {
            if (cache.pending.get(key) !== current) return;
            if (
              /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH|FORBIDDEN|NOT_FOUND)/.test(
                String(reason),
              )
            )
              invalidateResources(cache, String(reason));
            else if (/GH_HEAD_CHANGED/.test(String(reason)))
              invalidateRecord(cache, account, repo, number);
          },
        )
        .finally(() => {
          if (cache.pending.get(key) === current) cache.pending.delete(key);
        });
    }
    const current = pending;
    void current.hydration?.then(
      (response) => {
        if (!response || current.invalidated || !active) return;
        current.source = fresh(response) ? 'disk' : 'network';
        setState({
          key,
          response: response as GitHubResponse<T>,
          error: response.error ?? '',
          loading: !fresh(response),
          receivedAt: performance.now(),
          requestMs: performance.now() - started,
          source: 'disk',
          validationKey,
        });
      },
      () => undefined,
    );
    function fail(reason: unknown) {
      if (active)
        setState((previous) => ({
          ...previous,
          key,
          response:
            /GH_(AUTH_REQUIRED|ACCOUNT_CHANGED|APP_PERMISSIONS_UNSAFE|APP_IDENTITY_MISMATCH|FORBIDDEN|NOT_FOUND|HEAD_CHANGED)/.test(
              String(reason),
            )
              ? undefined
              : previous.key === key
                ? previous.response
                : (cache.responses.get(key) as GitHubResponse<T> | undefined),
          error: String(reason),
          loading: false,
        }));
    }
    void current.promise.then((response) => {
      // Invalidation may follow settlement before this consumer's callback runs.
      if (current.invalidated) {
        fail(current.invalidated);
        return;
      }
      if (active)
        setState({
          key,
          response: response as GitHubResponse<T>,
          error: response.error ?? '',
          loading: false,
          receivedAt: performance.now(),
          requestMs: performance.now() - started,
          source: current.source === 'disk' ? 'disk' : 'network',
          validationKey,
        });
    }, fail);
    return () => {
      active = false;
    };
  }, [
    gateway,
    cache,
    operation,
    repo,
    account,
    number,
    head,
    key,
    attempt,
    enabled,
    minFetchedAt,
    expectedHead,
    validationKey,
  ]);
  useLayoutEffect(() => {
    if (state.key !== key || !state.response || state.error) return;
    if (state.source === 'memory' && state.receivedAt === 0) {
      if (cachedRecorded.current) return;
      cachedRecorded.current = true;
      cache.samples.push({
        operation,
        source: 'memory',
        requestMs: 0,
        uiCommitMs: performance.now() - mountedAt,
      });
    } else if (!state.loading || state.source === 'disk') {
      cache.samples.push({
        operation,
        source: state.source,
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
  return {
    response: enabled ? current.response : undefined,
    error: enabled ? current.error : '',
    loading: enabled && current.loading,
    liveValidated:
      state.key === key &&
      state.validationKey === validationKey &&
      state.source === 'network' &&
      !state.loading &&
      !state.error &&
      !state.response?.stale,
    retry,
  };
}
