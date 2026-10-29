import { useState } from 'react';

export function GitHubAvatar({ login, url }: { login?: string; url?: string | null }) {
  const [failed, setFailed] = useState('');
  let trusted = false;
  try {
    const parsed = new URL(url ?? '');
    trusted =
      parsed.protocol === 'https:' &&
      parsed.hostname === 'avatars.githubusercontent.com' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port;
  } catch {
    /* Missing or invalid avatar URLs use the account initials. */
  }
  return (
    <span className="avatar">
      {trusted && url && failed !== url ? (
        <img
          src={url}
          alt={`${login ?? 'GitHub'} 的头像`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(url)}
        />
      ) : (
        (login?.slice(0, 1).toUpperCase() ?? '?')
      )}
    </span>
  );
}
