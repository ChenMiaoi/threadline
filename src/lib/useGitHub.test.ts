// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useGitHub } from './useGitHub';
import { createGateway, record, repo, response, user } from '../test/github.fixture';
afterEach(cleanup);
describe('GitHub synchronization', () => {
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
  it('clears account data if gh switches users during synchronization', async () => {
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
