import { afterEach, expect, it, vi } from 'vitest';
import { loadGitHubAvatar, trustedAvatarUrl } from './avatar-cache';

const url = 'https://avatars.githubusercontent.com/u/7';
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: string) => entries.get(key)?.clone()),
    put: vi.fn(async (key: string, value: Response) => {
      entries.set(key, value);
    }),
    keys: vi.fn(async () => [...entries.keys()]),
    delete: vi.fn(async (key: string) => entries.delete(key)),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  const fetcher = vi.fn(
    async () => new Response('image bytes', { headers: { 'content-type': 'image/png' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  return { entries, cache, fetcher };
}
it('persists avatars and reuses them without another network request', async () => {
  const { cache, fetcher } = setup();
  const [first, concurrent] = await Promise.all([loadGitHubAvatar(url), loadGitHubAvatar(url)]);
  expect(await first?.text()).toBe('image bytes');
  expect(concurrent).toBe(first);
  expect(cache.put).toHaveBeenCalledOnce();
  expect(await (await loadGitHubAvatar(url))?.text()).toBe('image bytes');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
});
it('refreshes expired images and keeps a cached avatar available offline', async () => {
  const { entries, fetcher } = setup();
  entries.set(
    url,
    new Response('old', { headers: { 'x-cached-at': '1', 'content-type': 'image/png' } }),
  );
  fetcher.mockRejectedValueOnce(new Error('offline'));
  expect(await (await loadGitHubAvatar(url))?.text()).toBe('old');
  expect(await (await loadGitHubAvatar(url))?.text()).toBe('image bytes');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects untrusted URLs and non-image responses', async () => {
  const { fetcher, cache } = setup();
  for (const value of [
    'http://avatars.githubusercontent.com/u/7',
    'https://avatars.githubusercontent.com.evil.test/u/7',
    'https://me:secret@avatars.githubusercontent.com/u/7',
  ]) {
    expect(trustedAvatarUrl(value)).toBeNull();
    expect(await loadGitHubAvatar(value)).toBeNull();
  }
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(new Response('html', { headers: { 'content-type': 'text/html' } }));
  expect(await loadGitHubAvatar(url)).toBeNull();
  expect(cache.put).not.toHaveBeenCalled();
});
it('limits disk entries and still loads when storage is unavailable', async () => {
  const { entries, cache } = setup();
  for (let i = 0; i < 200; i++) entries.set(`${url}?s=${i}`, new Response('old'));
  await loadGitHubAvatar(url);
  expect(entries.size).toBe(200);
  expect(cache.delete).toHaveBeenCalledOnce();
  vi.stubGlobal('caches', { open: vi.fn().mockRejectedValue(new Error('denied')) });
  expect(await (await loadGitHubAvatar(url))?.text()).toBe('image bytes');
});
