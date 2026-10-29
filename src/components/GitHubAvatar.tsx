import { useI18n } from '../i18n/I18n';
import { useState } from 'react';

export function GitHubAvatar({ login, url }: { login?: string; url?: string | null }) {
  const { t } = useI18n();

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
          alt={t('{0} 的头像', [login ?? 'GitHub'])}
          referrerPolicy="no-referrer"
          onError={() => setFailed(url)}
        />
      ) : (
        (login?.slice(0, 1).toUpperCase() ?? '?')
      )}
    </span>
  );
}
