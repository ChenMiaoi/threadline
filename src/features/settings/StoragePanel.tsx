import { FloatingWarning } from '../../components/FloatingWarnings';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18n';
import { isDesktop } from '../../lib/desktop';
import { clearCache, formatBytes, loadStorageUsage, type StorageUsage } from '../../lib/storage';

export function StoragePanel() {
  const { t, locale } = useI18n();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadStorageUsage().then(
      (value) => {
        if (active) {
          setUsage(value);
          setLoading(false);
          setError(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);
  const categories = usage
    ? [
        {
          label: '程序文件',
          bytes: usage.programBytes,
          color: 'var(--accent)',
        },
        { label: '本地数据', bytes: usage.dataBytes, color: 'var(--green)' },
        { label: '缓存', bytes: usage.cacheBytes, color: 'var(--blue, #6aa9f4)' },
        { label: '运行组件', bytes: usage.runtimeBytes ?? 0, color: 'var(--yellow)' },
        ...(!isDesktop && usage.browserBytes != null
          ? [{ label: '浏览器存储（估算）', bytes: usage.browserBytes, color: 'var(--muted)' }]
          : []),
      ]
    : [];
  const total = categories.reduce((sum, item) => sum + item.bytes, 0);
  return (
    <section className="storage-panel" aria-label={t('磁盘占用')} aria-busy={loading}>
      <header className="storage-heading">
        <div>
          <h3>{t('磁盘占用')}</h3>
          {usage && <strong>{formatBytes(total, locale)}</strong>}
        </div>
        <button
          className="chip"
          aria-label={t('刷新磁盘占用')}
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setRevision((value) => value + 1);
          }}
        >
          {t('刷新')}
        </button>
      </header>
      {loading && <p role="status">{t('正在计算占用…')}</p>}
      {error && (
        <FloatingWarning title={t('无法读取磁盘占用')}>
          <p>{t('无法读取磁盘占用，请重试。')}</p>
          <button
            className="chip"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRevision((value) => value + 1);
            }}
          >
            {t('重试')}
          </button>
        </FloatingWarning>
      )}
      {usage && (
        <>
          <div className="storage-bar" aria-hidden="true">
            {categories.map((item) => (
              <span key={item.label} style={{ flexGrow: item.bytes, background: item.color }} />
            ))}
          </div>
          <dl className="storage-categories">
            {categories.map((item) => (
              <div key={item.label}>
                <dt>
                  <i style={{ background: item.color }} aria-hidden="true" />
                  {t(item.label)}
                </dt>
                <dd>
                  {item.label === '程序文件' && !usage.programAvailable
                    ? t('未找到程序文件')
                    : formatBytes(item.bytes, locale)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="storage-cleanup" role="group" aria-label={t('定向清理缓存')}>
            {(
              [
                'responses',
                'avatars',
                ...(usage.webCacheClearable ? ['web-resources'] : []),
              ] as const
            ).map((kind) => (
              <button
                key={kind}
                className="chip"
                disabled={loading || clearing}
                onClick={async () => {
                  setClearing(true);
                  setClearError(false);
                  try {
                    await clearCache(kind as 'responses' | 'avatars' | 'web-resources');
                    setLoading(true);
                    setRevision((value) => value + 1);
                  } catch {
                    setClearError(true);
                  } finally {
                    setClearing(false);
                  }
                }}
              >
                {t(
                  kind === 'responses'
                    ? '清理 GitHub 响应'
                    : kind === 'avatars'
                      ? '清理头像缓存'
                      : '清理页面资源',
                )}
              </button>
            ))}
          </div>
          <p className="storage-note">
            {t('响应上限 32 MiB · 头像上限 8 MiB')}
            {usage.webCacheClearable && t(' · 页面资源目标 32 MiB')}
          </p>
          {clearError && (
            <FloatingWarning title={t('缓存清理未完成')}>
              <p>{t('缓存清理失败，请重试。')}</p>
            </FloatingWarning>
          )}
          {usage.incomplete && (
            <p role="status" className="storage-note">
              {t('部分文件无法读取，当前显示已统计的占用。')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
