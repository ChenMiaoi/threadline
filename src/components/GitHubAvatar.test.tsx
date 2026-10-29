// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { GitHubAvatar } from './GitHubAvatar';
import { loadGitHubAvatar } from '../lib/avatar-cache';
vi.mock('../lib/avatar-cache', async (original) => ({
  ...(await original<typeof import('../lib/avatar-cache')>()),
  loadGitHubAvatar: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('renders the cached image and releases its local URL on unmount', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached-avatar');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const blob = new Blob(['avatar'], { type: 'image/png' });
  vi.mocked(loadGitHubAvatar).mockResolvedValue(blob);
  const { unmount } = render(
    <GitHubAvatar login="reviewer" url="https://avatars.githubusercontent.com/u/8" />,
  );
  const image = await screen.findByRole('img', { name: 'reviewer 的头像' });
  expect(image.getAttribute('src')).toBe('blob:cached-avatar');
  expect(create).toHaveBeenCalledWith(blob);
  unmount();
  expect(revoke).toHaveBeenCalledWith('blob:cached-avatar');
});
it('ignores an earlier avatar response after the reviewer changes', async () => {
  let finish!: (value: Blob) => void;
  vi.mocked(loadGitHubAvatar)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(null);
  const { rerender } = render(
    <GitHubAvatar login="first" url="https://avatars.githubusercontent.com/u/1" />,
  );
  rerender(<GitHubAvatar login="second" url="https://avatars.githubusercontent.com/u/2" />);
  await screen.findByRole('img', { name: 'second 的头像' });
  await act(async () => finish(new Blob(['old'])));
  expect(screen.getByRole('img').getAttribute('src')).toBe(
    'https://avatars.githubusercontent.com/u/2',
  );
});
