import { useI18n } from '../i18n/I18n';
import { useEffect, useState } from 'react';
import { loadGitHubAvatar, trustedAvatarUrl } from '../lib/avatar-cache';

export function GitHubAvatar({ login, url }: { login?: string; url?: string | null }) {
  const { t } = useI18n();
  const trusted = trustedAvatarUrl(url);
  const [image, setImage] = useState<{ url: string; src: string } | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    if (!trusted) return;
    let active = true;
    let objectUrl: string | undefined;
    void loadGitHubAvatar(trusted).then((blob) => {
      if (!active) return;
      if (blob && typeof URL.createObjectURL === 'function') objectUrl = URL.createObjectURL(blob);
      setImage({ url: trusted, src: objectUrl ?? trusted });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [trusted]);
  const src = image?.url === trusted ? image.src : null;
  return (
    <span className="avatar">
      {src && failed !== src ? (
        <img
          src={src}
          alt={t('{0} 的头像', [login ?? 'GitHub'])}
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        (login?.slice(0, 1).toUpperCase() ?? '?')
      )}
    </span>
  );
}
