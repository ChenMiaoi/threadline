import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18n';
import { isDesktop } from '../../lib/desktop';
import { formatBytes, loadStorageUsage, type StorageUsage } from '../../lib/storage';

export function StoragePanel() {
  const { t, locale } = useI18n();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
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
      {error && <p role="alert">{t('无法读取磁盘占用，请重试。')}</p>}
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
                  {item.label.startsWith('程序文件') && !usage.programAvailable
                    ? t('未找到程序文件')
                    : formatBytes(item.bytes, locale)}
                </dd>
              </div>
            ))}
          </dl>
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
