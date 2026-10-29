// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createResourceCache, invalidateRecord, useGitHubResource } from './useGitHubResource';
import type { GitHubResponse } from '../core/github';
import { createGateway, repo, response } from '../test/github.fixture';
afterEach(cleanup);
it('shows in-session content immediately on remount while revalidating without another pending request', async () => {
  const gateway = createGateway();
  const cache = createResourceCache();
  const first = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  first.unmount();
  let finish!: (value: GitHubResponse<unknown>) => void;
  vi.mocked(gateway.request).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const second = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  expect(second.result.current.response).toBeDefined();
  expect(second.result.current.loading).toBe(true);
  second.unmount();
  const third = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  expect(gateway.request).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish(response({ current: true }));
  });
  await waitFor(() => expect(third.result.current.loading).toBe(false));
  expect(cache.samples.some((sample) => sample.source === 'memory')).toBe(true);
});
it('never displays the previous repository, account, record, or revision when resource identity changes', async () => {
  const gateway = createGateway();
  const cache = createResourceCache();
  const { result, rerender } = renderHook(
    ({ repository, account, number, head }) =>
      useGitHubResource(gateway, cache, 'files', repository, account, number, head),
    { initialProps: { repository: repo, account: 7, number: 1042, head: 'a'.repeat(40) } },
  );
  await waitFor(() => expect(result.current.response).toBeDefined());
  vi.mocked(gateway.request).mockImplementation(() => new Promise(() => {}));
  for (const props of [
    { repository: 'owner/other', account: 7, number: 1042, head: 'a'.repeat(40) },
    { repository: repo, account: 8, number: 1042, head: 'a'.repeat(40) },
    { repository: repo, account: 7, number: 42, head: 'a'.repeat(40) },
    { repository: repo, account: 7, number: 1042, head: 'b'.repeat(40) },
  ]) {
    rerender(props);
    expect(result.current.response).toBeUndefined();
  }
});
it('purges known invalid data on access or HEAD errors instead of showing it after another reopen', async () => {
  for (const error of ['GH_FORBIDDEN', 'GH_ACCOUNT_CHANGED', 'GH_HEAD_CHANGED']) {
    const gateway = createGateway();
    const cache = createResourceCache();
    const first = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
    await waitFor(() => expect(first.result.current.response).toBeDefined());
    first.unmount();
    vi.mocked(gateway.request).mockRejectedValue(error);
    const second = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
    await waitFor(() => expect(second.result.current.error).toBe(error));
    expect(second.result.current.response).toBeUndefined();
    expect(cache.responses.size).toBe(0);
    second.unmount();
  }
});
it('retains known content on transient failure and retries successfully', async () => {
  const gateway = createGateway();
  const cache = createResourceCache();
  const first = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  await waitFor(() => expect(first.result.current.response).toBeDefined());
  first.unmount();
  vi.mocked(gateway.request)
    .mockRejectedValueOnce('GH_TIMEOUT')
    .mockResolvedValue(response({ recovered: true }));
  const next = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  await waitFor(() => expect(next.result.current.error).toBe('GH_TIMEOUT'));
  expect(next.result.current.response).toBeDefined();
  act(() => next.result.current.retry());
  await waitFor(() => expect(next.result.current.response?.payload).toEqual({ recovered: true }));
  expect(next.result.current.error).toBe('');
});

it('does not mislabel manual refresh time as an initial cached render', async () => {
  const gateway = createGateway();
  const cache = createResourceCache();
  const { result } = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  await waitFor(() => expect(result.current.loading).toBe(false));
  vi.mocked(gateway.request).mockImplementation(() => new Promise(() => {}));
  act(() => result.current.retry());
  expect(result.current.loading).toBe(true);
  expect(cache.samples.filter((sample) => sample.source === 'memory')).toEqual([]);
});

it('does not report the old response commit time after a failed retry', async () => {
  const gateway = createGateway();
  const cache = createResourceCache();
  const { result } = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const samples = cache.samples.length;
  vi.mocked(gateway.request).mockRejectedValueOnce('GH_TIMEOUT');
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toBe('GH_TIMEOUT'));
  expect(cache.samples).toHaveLength(samples);
});

function deferredResponse() {
  let resolve!: (value: GitHubResponse<unknown>) => void;
  let reject!: (reason: string) => void;
  const promise = new Promise<GitHubResponse<unknown>>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it.each(['files', 'discussion'] as const)(
  'invalidates pending %s requests without joining or publishing their obsolete results',
  async (operation) => {
    const gateway = createGateway();
    const cache = createResourceCache();
    const obsolete = deferredResponse();
    const fresh = deferredResponse();
    vi.mocked(gateway.request)
      .mockImplementationOnce(() => obsolete.promise)
      .mockImplementationOnce(() => fresh.promise);
    const first = renderHook(() => useGitHubResource(gateway, cache, operation, repo, 7, 1042));
    await act(async () => invalidateRecord(cache, 7, repo, 1042));
    expect(first.result.current.loading).toBe(false);
    expect(first.result.current.response).toBeUndefined();
    const second = renderHook(() => useGitHubResource(gateway, cache, operation, repo, 7, 1042));
    expect(gateway.request).toHaveBeenCalledTimes(2);
    await act(async () => fresh.resolve(response({ version: 'fresh' })));
    await act(async () => obsolete.resolve(response({ version: 'obsolete' })));
    expect(first.result.current.response).toBeUndefined();
    expect(second.result.current.response?.payload).toEqual({ version: 'fresh' });
    expect([...cache.responses.values()].map((value) => value.payload)).toEqual([
      { version: 'fresh' },
    ]);
    vi.mocked(gateway.request).mockResolvedValueOnce(response({ version: 'retried' }));
    act(() => first.result.current.retry());
    await waitFor(() =>
      expect(first.result.current.response?.payload).toEqual({ version: 'retried' }),
    );
    expect(first.result.current.loading).toBe(false);
    expect(first.result.current.error).toBe('');
  },
);

it.each(['GH_AUTH_REQUIRED', 'GH_ACCOUNT_CHANGED', 'GH_FORBIDDEN', 'GH_NOT_FOUND'])(
  'invalidates sibling requests when access fails with %s and permits retry',
  async (error) => {
    const gateway = createGateway();
    const cache = createResourceCache();
    const denied = deferredResponse();
    const sibling = deferredResponse();
    vi.mocked(gateway.request)
      .mockImplementationOnce(() => denied.promise)
      .mockImplementationOnce(() => sibling.promise);
    const first = renderHook(() => useGitHubResource(gateway, cache, 'pull', repo, 7, 1042));
    const second = renderHook(() => useGitHubResource(gateway, cache, 'discussion', repo, 7, 1043));
    await act(async () => denied.reject(error));
    expect(first.result.current.error).toBe(error);
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.error).toBe(error);
    await act(async () => sibling.resolve(response({ obsolete: true })));
    expect(cache.responses.size).toBe(0);
    expect(second.result.current.response).toBeUndefined();
    vi.mocked(gateway.request).mockResolvedValueOnce(response({ recovered: true }));
    act(() => second.result.current.retry());
    await waitFor(() =>
      expect(second.result.current.response?.payload).toEqual({ recovered: true }),
    );
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.error).toBe('');
  },
);

it('keeps the replacement request deduplicated when an invalidated request fails late', async () => {
  const gateway = createGateway();
  const cache = createResourceCache();
  const obsolete = deferredResponse();
  const fresh = deferredResponse();
  const unrelated = deferredResponse();
  vi.mocked(gateway.request)
    .mockImplementationOnce(() => obsolete.promise)
    .mockImplementationOnce(() => unrelated.promise)
    .mockImplementationOnce(() => fresh.promise);
  const first = renderHook(() => useGitHubResource(gateway, cache, 'files', repo, 7, 1042));
  const sibling = renderHook(() => useGitHubResource(gateway, cache, 'files', repo, 7, 1043));
  await act(async () => invalidateRecord(cache, 7, repo, 1042));
  const second = renderHook(() => useGitHubResource(gateway, cache, 'files', repo, 7, 1042));
  await act(async () => obsolete.reject('GH_FORBIDDEN'));
  const third = renderHook(() => useGitHubResource(gateway, cache, 'files', repo, 7, 1042));
  expect(gateway.request).toHaveBeenCalledTimes(3);
  await act(async () => {
    fresh.resolve(response({ version: 'fresh' }));
    unrelated.resolve(response({ version: 'unrelated' }));
  });
  expect(first.result.current.response).toBeUndefined();
  expect(second.result.current.response?.payload).toEqual({ version: 'fresh' });
  expect(third.result.current.response?.payload).toEqual({ version: 'fresh' });
  expect(sibling.result.current.response?.payload).toEqual({ version: 'unrelated' });
  expect(cache.responses.size).toBe(2);
});
