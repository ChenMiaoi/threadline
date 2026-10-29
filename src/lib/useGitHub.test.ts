// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useGitHub } from './useGitHub';
import { createGateway, record, repo, response, user } from '../test/github.fixture';
afterEach(cleanup);
describe('GitHub synchronization', () => {
  it('publishes completed pages while a slow page is pending and coalesces refreshes', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    let finish!: (value: unknown) => void;
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'review'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(result.current.syncing).toBe(true);
    expect(result.current.times.authored).toBeDefined();
    expect(result.current.times.review).toBeUndefined();
    const calls = vi.mocked(gateway.request).mock.calls.length;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
      void result.current.refresh();
    });
    expect(gateway.request).toHaveBeenCalledTimes(calls);
    await act(async () => {
      finish(response([{ data: { search: { issueCount: 0, nodes: [] } } }]));
      await pending;
    });
    expect(result.current.syncing).toBe(false);
    expect(result.current.times.review).toBeDefined();
  });
  it('clears early page results and ignores pending pages after authentication is lost', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    let fail!: (reason: string) => void;
    let finish!: (value: unknown) => void;
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'review'
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : operation === 'issues'
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(async () => {
      fail('GH_ACCOUNT_CHANGED');
    });
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    await act(async () => {
      finish(response([]));
    });
    expect(result.current.issues).toEqual([]);
    expect(result.current.times.issues).toBeUndefined();
  });
  it('restores a remembered session on remount and stays signed out after logout', async () => {
    const gateway = createGateway();
    let signedIn = true;
    vi.mocked(gateway.session).mockImplementation(async () => {
      if (!signedIn) throw 'GH_AUTH_REQUIRED';
      return { user, selected: repo, notificationsAvailable: true };
    });
    vi.mocked(gateway.logout).mockImplementation(async () => {
      signedIn = false;
    });
    const first = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(first.result.current.pulls).toHaveLength(2));
    first.unmount();
    const restored = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(restored.result.current.pulls).toHaveLength(2));
    expect(restored.result.current.session?.user.id).toBe(user.id);
    expect(restored.result.current.repo).toBe(repo);
    expect(gateway.login).not.toHaveBeenCalled();
    await act(() => restored.result.current.disconnect());
    expect(restored.result.current.session).toBeNull();
    expect(restored.result.current.pulls).toEqual([]);
    expect(restored.result.current.repo).toBe('');
    restored.unmount();
    const signedOut = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(signedOut.result.current.connecting).toBe(false));
    expect(signedOut.result.current.session).toBeNull();
    expect(signedOut.result.current.pulls).toEqual([]);
  });
  it('keeps the loaded workspace when confirming the same repository after login', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(() => result.current.selectRepository(repo));
    expect(result.current.repo).toBe(repo);
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.times.authored).toBeDefined();
  });
  it('skips unsupported notifications without reporting a sync failure or an empty notification result', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockResolvedValue({
      user,
      selected: repo,
      notificationsAvailable: false,
    });
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(vi.mocked(gateway.request).mock.calls.some(([operation]) => operation === 'inbox')).toBe(
      false,
    );
    expect(result.current.errors.inbox).toBeUndefined();
    expect(result.current.times.inbox).toBeUndefined();
  });
  it('clears account records when disconnecting only the independent app', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(() => result.current.disconnect());
    expect(gateway.logout).toHaveBeenCalledOnce();
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    expect(result.current.repo).toBe('');
  });
  it('keeps logout failures visible instead of claiming the credential was cleared', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.logout).mockRejectedValue('GH_SECURE_STORAGE');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(() => result.current.disconnect());
    expect(result.current.session?.user.id).toBe(user.id);
    expect(result.current.connectionError).toBe('GH_SECURE_STORAGE');
  });
  it('keeps successful pages when notifications lack permission', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi
      .fn()
      .mockImplementation((operation, repository, accountId, number) =>
        operation === 'inbox'
          ? Promise.reject('GH_FORBIDDEN')
          : request(operation, repository, accountId, number),
      );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(result.current.errors.inbox).toBe('GH_FORBIDDEN');
    expect(result.current.inbox).toEqual([]);
    expect(result.current.errors.authored).toBeUndefined();
  });
  it('discards late data from the previous repository', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    let finish: (value: unknown) => void = () => {};
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'authored' && repository === repo
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(gateway.request).toHaveBeenCalledWith('authored', repo, user.id));
    await act(() => result.current.selectRepository('owner/other'));
    await waitFor(() => expect(result.current.key).toBe('7:owner/other'));
    await act(async () =>
      finish(
        response([
          {
            data: {
              search: { issueCount: 1, nodes: [{ ...record, title: 'Old repository result' }] },
            },
          },
        ]),
      ),
    );
    expect(result.current.repo).toBe('owner/other');
    expect(result.current.pulls.some((p) => p.title === 'Old repository result')).toBe(false);
  });
  it('preserves the selected repository if access validation fails', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.select).mockRejectedValue('GH_FORBIDDEN');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(async () => {
      await expect(result.current.selectRepository('private/denied')).rejects.toBe('GH_FORBIDDEN');
    });
    expect(result.current.repo).toBe(repo);
    expect(result.current.repositoryError).toBe('GH_FORBIDDEN');
  });
  it('clears account data if the authorized account changes during synchronization', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    vi.mocked(gateway.request).mockRejectedValue('GH_ACCOUNT_CHANGED');
    await act(() => result.current.refresh());
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    expect(result.current.connectionError).toBe('GH_ACCOUNT_CHANGED');
  });
  it('retains records with an explicit stale warning and timestamp on network failure', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    const fetchedAt = result.current.times.authored;
    vi.mocked(gateway.request).mockRejectedValue('GH_REQUEST_FAILED');
    await act(() => result.current.refresh());
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.times.authored).toBe(fetchedAt);
    expect(result.current.errors.authored).toBe('GH_REQUEST_FAILED');
  });
  it('replaces stale records and clears errors after a successful refresh', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    const fetchedAt = result.current.times.authored!;
    vi.mocked(gateway.request).mockRejectedValue('GH_REQUEST_FAILED');
    await act(() => result.current.refresh());
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.times.authored).toBe(fetchedAt);
    expect(result.current.errors.authored).toBe('GH_REQUEST_FAILED');
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'authored'
        ? Promise.resolve({
            ...response([
              { data: { search: { issueCount: 1, nodes: [{ ...record, title: 'Recovered' }] } } },
            ]),
            fetchedAt: fetchedAt + 1000,
          })
        : request(operation, repository, accountId, number),
    );
    await act(() => result.current.refresh());
    expect(result.current.pulls.map((pull) => pull.title)).toEqual(['Recovered']);
    expect(result.current.times.authored).toBe(fetchedAt + 1000);
    expect(result.current.errors.authored).toBeUndefined();
  });
  it('ignores a late refresh after reconnecting', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    let fail: (reason: string) => void = () => {};
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'authored'
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : request(operation, repository, accountId, number),
    );
    let pending: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    gateway.request = request;
    await act(() => result.current.connect());
    await act(async () => {
      fail('GH_AUTH_REQUIRED');
      await pending;
    });
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.session?.user.id).toBe(user.id);
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.connectionError).toBe('');
  });
  it('retains the current workspace when rechecking the connection fails temporarily', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    vi.mocked(gateway.session).mockRejectedValueOnce('GH_REQUEST_FAILED');
    await act(() => result.current.connect());
    expect(result.current.session?.user.id).toBe(user.id);
    expect(result.current.repo).toBe(repo);
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.connectionError).toBe('GH_REQUEST_FAILED');
    await act(() => result.current.connect());
    await waitFor(() => expect(result.current.connectionError).toBe(''));
  });
  it('clears the workspace when rechecking reveals lost authentication', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    vi.mocked(gateway.session).mockRejectedValueOnce('GH_AUTH_REQUIRED');
    await act(() => result.current.connect());
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
  });
  it('does not clear an earlier request error until a retry succeeds', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValueOnce('GH_AUTH_REQUIRED');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.connectionError).toBe('GH_AUTH_REQUIRED'));
    expect(result.current.session).toBeNull();
    await act(() => result.current.connect());
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(result.current.connectionError).toBe('');
  });
});
