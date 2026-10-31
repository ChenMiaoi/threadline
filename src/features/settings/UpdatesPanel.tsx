import { FloatingWarning, FloatingInfo, FloatingUpdate } from '../../components/FloatingWarnings';
import { useI18n } from '../../i18n/I18n';
import type { useUpdates } from '../../lib/useUpdates';
import { Icon } from '../../components/Icon';
import { GitHubMarkdown } from '../../components/GitHubMarkdown';

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
    <section className="updates-card" aria-label={t('版本与更新')} data-status={updates.status}>
      <div className="updates-header">
        <span className="updates-logo">
          <Icon name="brand" />
        </span>
        <div>
          <h2>ThreadLine {updates.version}</h2>
          <span className="updates-channel">{updates.channel}</span>
        </div>
      </div>
      <div className="updates-state">
        {updates.status === 'available' ? (
          <FloatingUpdate title={t('版本与更新')}>
            <p>{t(labels[updates.status])}</p>
          </FloatingUpdate>
        ) : ['current', 'ready', 'restart'].includes(updates.status) ? (
          <FloatingInfo title={t('版本与更新')}>
            <p>{t(labels[updates.status])}</p>
          </FloatingInfo>
        ) : (
          updates.status !== 'error' && (
            <p role="status" className="updates-status">
              {t(labels[updates.status])}
            </p>
          )
        )}

        {updates.status !== 'unavailable' && (
          <div className="inline-group updates-actions">
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
      {updates.error && (
        <FloatingWarning title={t('更新未完成')} key={updates.error}>
          <p>{updates.error}</p>
          <button className="chip" onClick={() => void updates.check()}>
            {t('检查更新')}
          </button>
        </FloatingWarning>
      )}
      {updates.status === 'downloading' && (
        <div className="updates-progress">
          <progress
            aria-label={t('更新下载进度')}
            value={updates.total ? updates.received : undefined}
            max={updates.total ?? 1}
          />
          <p>
            {(updates.received / 1048576).toFixed(1)} MB
            {updates.total ? ` / ${(updates.total / 1048576).toFixed(1)} MB` : ''}
          </p>
        </div>
      )}
      {updates.checkedAt > 0 && (
        <p className="updates-checked">
          {t('上次检查：')}
          <time
            dateTime={new Date(updates.checkedAt).toISOString()}
            title={new Date(updates.checkedAt).toLocaleString(locale)}
          >
            {new Date(updates.checkedAt).toLocaleString(locale, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </p>
      )}
      {updates.notes && (
        <details className="updates-notes">
          <summary>{t('更新说明')}</summary>
          <GitHubMarkdown repo="ChenMiaoi/threadline">{updates.notes}</GitHubMarkdown>
        </details>
      )}
    </section>
  );
}
