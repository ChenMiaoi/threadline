const CACHE_NAME = 'threadline-github-avatars-v1';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_BYTES = 8 * 1024 * 1024;
const pending = new Map<string, Promise<Blob | null>>();

export function trustedAvatarUrl(url?: string | null): string | null {
  try {
    const parsed = new URL(url ?? '');
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'avatars.githubusercontent.com' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

async function readAvatar(url: string): Promise<Blob | null> {
  let cache: Cache | undefined;
  let cached: Response | undefined;
  try {
    cache = await caches.open(CACHE_NAME);
    cached = await cache.match(url);
    if (cached && Date.now() - Number(cached.headers.get('x-cached-at') ?? 0) < MAX_AGE) {
      return await cached.blob();
    }
  } catch {
    /* Storage can be unavailable in restricted webviews. */
  }
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
      throw new Error('Invalid avatar response');
    }
    const blob = await response.blob();
    if (blob.size > 2 * 1024 * 1024) throw new Error('Avatar too large');
    try {
      if (cache) {
        await cache.put(
          url,
          new Response(blob, {
            headers: { 'content-type': blob.type, 'x-cached-at': String(Date.now()) },
          }),
        );
        await pruneAvatars(cache);
      }
    } catch {
      /* A full cache must not prevent displaying an avatar. */
    }
    return blob;
  } catch {
    return cached ? cached.blob() : null;
  }
}

export function loadGitHubAvatar(url: string): Promise<Blob | null> {
  const trusted = trustedAvatarUrl(url);
  if (!trusted) return Promise.resolve(null);
  const existing = pending.get(trusted);
  if (existing) return existing;
  const request = readAvatar(trusted).finally(() => pending.delete(trusted));
  pending.set(trusted, request);
  return request;
}

async function pruneAvatars(cache: Cache) {
  const entries = await Promise.all(
    (await cache.keys()).map(async (key) => {
      const value = await cache.match(key);
      return {
        key,
        bytes: value ? (await value.blob()).size : 0,
        time: Number(value?.headers.get('x-cached-at') ?? 0),
      };
    }),
  );
  entries.sort((a, b) => b.time - a.time);
  let bytes = 0;
  let count = 0;
  for (const entry of entries) {
    if (
      Date.now() - entry.time > MAX_AGE ||
      count >= MAX_ENTRIES ||
      bytes + entry.bytes > MAX_BYTES
    )
      await cache.delete(entry.key);
    else {
      bytes += entry.bytes;
      count++;
    }
  }
}
export async function clearAvatarCache() {
  await caches.delete(CACHE_NAME);
}
