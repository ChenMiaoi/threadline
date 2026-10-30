// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createGateway, response } from '../test/github.fixture';
import type { GitHubResponse } from '../core/github';
import { useRepositoryAvatar } from './useRepositoryAvatar';

afterEach(cleanup);

it('loads the owner avatar from repository metadata', async () => {
  const gateway = createGateway();
  vi.mocked(gateway.request).mockResolvedValue(
    response({ owner: { avatar_url: 'https://avatars.githubusercontent.com/u/1' } }),
  );
  const { result } = renderHook(() => useRepositoryAvatar(gateway, 'org/repo', 7));
  await waitFor(() => expect(result.current).toBe('https://avatars.githubusercontent.com/u/1'));
  expect(gateway.request).toHaveBeenCalledWith('repository', 'org/repo', 7);
});

it('keeps cached metadata available when offline', async () => {
  const gateway = createGateway();
  gateway.cached = vi
    .fn()
    .mockResolvedValue(
      response({ owner: { avatar_url: 'https://avatars.githubusercontent.com/u/2' } }),
    );
  vi.mocked(gateway.request).mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useRepositoryAvatar(gateway, 'org/repo', 7));
  await waitFor(() => expect(result.current).toBe('https://avatars.githubusercontent.com/u/2'));
});

it('discards late responses after switching repositories and clears the previous avatar', async () => {
  const gateway = createGateway();
  let finish!: (value: GitHubResponse<unknown>) => void;
  vi.mocked(gateway.request)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(
      response({ owner: { avatar_url: 'https://avatars.githubusercontent.com/u/3' } }),
    );
  const { result, rerender } = renderHook(({ repo }) => useRepositoryAvatar(gateway, repo, 7), {
    initialProps: { repo: 'old/repo' },
  });
  await waitFor(() => expect(gateway.request).toHaveBeenCalledOnce());
  rerender({ repo: 'new/repo' });
  await waitFor(() => expect(result.current).toBe('https://avatars.githubusercontent.com/u/3'));
  await act(async () =>
    finish(response({ owner: { avatar_url: 'https://avatars.githubusercontent.com/u/1' } })),
  );
  expect(result.current).toBe('https://avatars.githubusercontent.com/u/3');
  rerender({ repo: '' });
  expect(result.current).toBeNull();
});
