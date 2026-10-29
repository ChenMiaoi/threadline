/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway } from '../test/github.fixture';
import { useGitHubLogin } from './useGitHubLogin';
import type { GitHubLoginState } from '../core/github';

const state = (status: GitHubLoginState['status']): GitHubLoginState => ({
  status,
  code: status === 'waiting' ? 'ABCD-1234' : null,
  verificationUrl: status === 'waiting' ? 'https://github.com/login/device' : null,
  error: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('GitHub device login', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it('polls until complete and refreshes the session once', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.loginStatus)
      .mockResolvedValueOnce(state('waiting'))
      .mockResolvedValueOnce(state('complete'));
    const authenticated = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useGitHubLogin(gateway, authenticated));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state.code).toBe('ABCD-1234');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state.status).toBe('complete');
    expect(authenticated).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(authenticated).toHaveBeenCalledOnce();
  });
  it('ignores a late poll after cancellation', async () => {
    const gateway = createGateway();
    const poll = deferred<GitHubLoginState>();
    vi.mocked(gateway.loginStatus).mockReturnValue(poll.promise);
    const authenticated = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useGitHubLogin(gateway, authenticated));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await result.current.cancel();
    });
    await act(async () => {
      poll.resolve(state('complete'));
      await poll.promise;
    });
    expect(result.current.state.status).toBe('cancelled');
    expect(authenticated).not.toHaveBeenCalled();
    expect(gateway.cancelLogin).toHaveBeenCalledOnce();
  });
  it('keeps the dialog dismissed when backend cancellation cannot be confirmed', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.cancelLogin).mockRejectedValue(new Error('IPC unavailable'));
    const { result } = renderHook(() => useGitHubLogin(gateway, vi.fn()));
    await act(() => result.current.start());
    await act(() => result.current.cancel());
    expect(result.current.state.status).toBe('cancelled');
    expect(result.current.state.error).toContain('无法确认');
    expect(result.current.busy).toBe(false);
  });
  it('ignores duplicate starts, allows retry after failure, and cancels on unmount', async () => {
    const gateway = createGateway();
    const first = deferred<GitHubLoginState>();
    vi.mocked(gateway.login)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(state('starting'));
    const { result, unmount } = renderHook(() => useGitHubLogin(gateway, vi.fn()));
    let request!: Promise<void>;
    act(() => {
      request = result.current.start();
      void result.current.start();
    });
    expect(gateway.login).toHaveBeenCalledOnce();
    await act(async () => {
      first.resolve({ ...state('error'), error: 'failed' });
      await request;
    });
    expect(result.current.state.status).toBe('error');
    await act(async () => {
      await result.current.start();
    });
    expect(gateway.login).toHaveBeenCalledTimes(2);
    unmount();
    expect(gateway.cancelLogin).toHaveBeenCalledOnce();
  });
  it('handles immediate completion and ignores a cancelled pending start', async () => {
    const gateway = createGateway();
    const first = deferred<GitHubLoginState>();
    vi.mocked(gateway.login)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(state('complete'));
    const authenticated = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useGitHubLogin(gateway, authenticated));
    let request!: Promise<void>;
    act(() => {
      request = result.current.start();
    });
    await act(async () => {
      await result.current.cancel();
    });
    await act(async () => {
      first.resolve(state('complete'));
      await request;
    });
    expect(authenticated).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.start();
    });
    expect(authenticated).toHaveBeenCalledOnce();
  });
});
