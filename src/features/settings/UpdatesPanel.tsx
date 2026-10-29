import { useI18n } from '../../i18n/I18n';
import type { useUpdates } from '../../lib/useUpdates';

export function UpdatesPanel({
  updates,
  flush,
}: {
  updates: ReturnType<typeof useUpdates>;
  flush: () => Promise<void>;
}) {
  const { t, locale } = useI18n();

  const labels = {
    loading: '正在读取版本…',
    unavailable: '此构建未启用自动更新。',
    idle: '尚未检查更新',
    checking: '正在检查更新…',
    current: '已是当前渠道的最新版本',
    available: t('发现新版本 {0}', [updates.nextVersion ?? '']),
    downloading: '正在下载更新…',
    ready: '更新已下载，安装后将重新启动。',
    installing: '正在保存数据并安装…',
    restart: '更新已安装，请重新启动。',
    error: '检查更新失败',
  };
  return (
    <section className="updates-card" aria-label={t('版本与更新')}>
      <div className="updates-header">
        <div>
          <h2>ThreadLine {updates.version}</h2>
          <p className="muted">{updates.channel}</p>
        </div>
        {updates.status !== 'unavailable' && (
          <div className="inline-group">
            <button
              className="chip"
              disabled={[
                'loading',
                'unavailable',
                'checking',
                'downloading',
                'ready',
                'installing',
                'restart',
              ].includes(updates.status)}
              onClick={() => void updates.check()}
            >
              {t('检查更新')}
            </button>
            {updates.status === 'available' && (
              <button className="chip accent" onClick={() => void updates.download()}>
                {t('下载更新')}
              </button>
            )}
            {['ready', 'restart'].includes(updates.status) && (
              <button className="chip accent" onClick={() => void updates.install(flush)}>
                {updates.status === 'restart' ? t('重新启动') : t('安装并重新启动')}
              </button>
            )}
          </div>
        )}
      </div>
      <p role="status">{t(labels[updates.status])}</p>
      {updates.checkedAt > 0 && (
        <p className="muted">
          {t('上次检查：')}
          {new Date(updates.checkedAt).toLocaleString(locale)}
        </p>
      )}
      {updates.error && <p role="alert">{updates.error}</p>}
      {updates.status === 'downloading' && (
        <>
          <progress
            aria-label={t('更新下载进度')}
            value={updates.total ? updates.received : undefined}
            max={updates.total ?? 1}
          />
          <p>
            {(updates.received / 1048576).toFixed(1)} MB
            {updates.total ? ` / ${(updates.total / 1048576).toFixed(1)} MB` : ''}
          </p>
        </>
      )}
      {updates.notes && (
        <details className="storage-details">
          <summary>{t('更新说明')}</summary>
          <pre className="release-notes">{updates.notes}</pre>
        </details>
      )}
    </section>
  );
}
