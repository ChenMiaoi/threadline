import { notificationSounds, type NotificationSound } from '../../core/notification-sound';
import { playNotificationSound } from '../../lib/notification-sound';
import { useI18n } from '../../i18n/I18n';
import { UpdatesPanel } from './UpdatesPanel';
import type { useUpdates } from '../../lib/useUpdates';
import { Modal } from '../../components/Modal';
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import type { Preferences } from '../../core/workspace';
import type { GitHubWorkspace } from '../../lib/useGitHub';
import { enableDesktopNotifications, notifyDesktop } from '../../lib/notifications';
import { PageHeader } from '../../components/PageHeader';
import { GitHubLoginButton } from '../states/GitHubLogin';
import { isDesktop } from '../../lib/desktop';
import { StoragePanel } from './StoragePanel';

const AppearanceSettings = lazy(() =>
  import('./AppearanceSettings').then((module) => ({ default: module.AppearanceSettings })),
);

const sections = [
  ['account', '账号与连接'],
  ['repositories', '仓库与同步'],
  ['notifications', '通知'],
  ['appearance', '外观'],
  ['language', '语言'],
  ['updates', '关于与更新'],
] as const;
type Section = (typeof sections)[number][0];

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="setting-row">
      <div className="setting-text">
        <h3>{t(title)}</h3>
        {description && <p>{t(description)}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      className={`toggle-switch ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      role="switch"
      aria-label={t(label)}
      aria-checked={checked}
      onClick={onChange}
    >
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
      <span className="toggle-label">{checked ? t('开启') : t('关闭')}</span>
    </button>
  );
}

export function SettingsPage({
  preferences,
  updates,
  flush = async () => {},
  onChange,
  onSync,
  github,
  onChooseRepository,
}: {
  preferences: Preferences;
  updates?: ReturnType<typeof useUpdates>;
  flush?: () => Promise<void>;
  onChange: (change: Partial<Preferences>) => void;
  onSync: () => void;
  github: GitHubWorkspace;
  onChooseRepository: () => void;
}) {
  const { t, locale } = useI18n();

  const [notificationError, setNotificationError] = useState('');
  const [notificationResult, setNotificationResult] = useState('');
  const [requestingNotifications, setRequestingNotifications] = useState(false);
  const [previewingSound, setPreviewingSound] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const cancelLogout = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState<Section>('account');

  const title = sections.find(([id]) => id === section)![1];
  return (
    <>
      {confirmLogout && (
        <Modal
          title={t('退出 ThreadLine 登录？')}
          onClose={() => setConfirmLogout(false)}
          initialFocusRef={cancelLogout}
        >
          <p>
            {t(
              '退出会删除本机保存的登录凭据和账号缓存，下次使用时需要重新授权 GitHub。你的 GitHub 数据不会被删除。',
            )}
          </p>
          <div className="inline-group settings-signout-actions">
            <button ref={cancelLogout} className="chip" onClick={() => setConfirmLogout(false)}>
              {t('取消')}
            </button>
            <button
              className="chip settings-danger"
              onClick={() => {
                setConfirmLogout(false);
                void github.disconnect();
              }}
            >
              {t('确认退出登录')}
            </button>
          </div>
        </Modal>
      )}
      <PageHeader title={t(title)} />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('设置分类')}>
          {sections.map(([id, label]) => (
            <button
              key={id}
              className={section === id ? 'active' : ''}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {section === 'language' ? (
            <SettingRow title={t('界面语言')}>
              <select
                className="setting-value accent"
                aria-label={t('界面语言')}
                value={preferences.language}
                onChange={(event) =>
                  onChange({ language: event.target.value as Preferences['language'] })
                }
              >
                <option value="system">{t('跟随系统')}</option>
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁體中文（台灣）</option>
                <option value="zh-HK">繁體中文（香港）</option>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </SettingRow>
          ) : section === 'updates' ? (
            <>
              {updates && <UpdatesPanel updates={updates} flush={flush} />}
              <StoragePanel />
              <SettingRow
                title={t('自动检查更新')}
                description={t('每 6 小时检查一次，安装前由你确认。')}
              >
                <Toggle
                  label={t('自动检查更新')}
                  disabled={updates?.status === 'unavailable'}
                  checked={preferences.autoCheckUpdates}
                  onChange={() => onChange({ autoCheckUpdates: !preferences.autoCheckUpdates })}
                />
              </SettingRow>
            </>
          ) : section === 'account' ? (
            <>
              <h2 className="settings-section-heading">{t('GitHub 连接')}</h2>
              <SettingRow
                title={github.session ? `@${github.session.user.login}` : t('尚未连接 GitHub')}
              >
                <GitHubLoginButton github={github} />
              </SettingRow>
              <SettingRow title={t('权限范围')} description={t('只读访问，不会修改 GitHub 数据。')}>
                <span className="muted">{t('独立只读授权')}</span>
              </SettingRow>
              <SettingRow
                title={t('代码与仓库访问')}
                description={t('可读取公开仓库；私有仓库需要单独安装并选择授权范围。')}
              >
                <span className="muted">{github.repo || '尚未选择仓库'}</span>
              </SettingRow>
              {github.session && (
                <section className="settings-signout" aria-label={t('登录管理')}>
                  <SettingRow
                    title={t('退出登录')}
                    description={t('清除本机登录凭据和账号缓存，下次使用时需要重新登录。')}
                  >
                    <button className="chip settings-danger" onClick={() => setConfirmLogout(true)}>
                      {t('退出 ThreadLine 登录')}
                    </button>
                  </SettingRow>
                </section>
              )}
            </>
          ) : section === 'repositories' ? (
            <>
              <h2 className="settings-section-heading">{t('仓库')}</h2>
              <SettingRow title={github.repo || '尚未选择仓库'}>
                <span className="muted">{github.repo ? t('已选择') : t('未选择')}</span>
              </SettingRow>
              <SettingRow title={t('选择仓库')}>
                <button className="setting-value accent" onClick={onChooseRepository}>
                  {t('选择仓库')}
                </button>
              </SettingRow>
              <h2 className="settings-section-heading">{t('同步偏好')}</h2>
              <SettingRow title={t('自动刷新')}>
                <select
                  className="setting-value accent"
                  aria-label={t('自动刷新频率')}
                  value={preferences.refreshMinutes}
                  onChange={(event) =>
                    onChange({
                      refreshMinutes: Number(event.target.value) as Preferences['refreshMinutes'],
                    })
                  }
                >
                  <option value={0}>{t('手动刷新')}</option>
                  <option value={1}>{t('每 1 分钟')}</option>
                  <option value={5}>{t('每 5 分钟')}</option>
                  <option value={15}>{t('每 15 分钟')}</option>
                </select>
              </SettingRow>
              <SettingRow title={t('最近同步')}>
                <span className="muted">
                  {Object.values(github.times).length
                    ? new Date(Math.max(...Object.values(github.times))).toLocaleString(locale)
                    : t('尚未同步')}
                </span>
              </SettingRow>
              <SettingRow title={t('手动刷新')}>
                <button
                  className="setting-value accent"
                  disabled={github.syncing || !github.session || !github.repo}
                  onClick={onSync}
                >
                  {github.syncing ? t('正在刷新…') : t('立即刷新')}
                </button>
              </SettingRow>
            </>
          ) : section === 'notifications' ? (
            <>
              <h2 className="settings-section-heading">{t('提醒类型')}</h2>
              <SettingRow
                title={t('需要我处理')}
                description={t('请求修改、提及我以及需要回复的讨论。')}
              >
                <Toggle
                  label={t('需要我处理的提醒')}
                  checked={preferences.notifyAttention}
                  onChange={() => onChange({ notifyAttention: !preferences.notifyAttention })}
                />
              </SettingRow>
              <SettingRow
                title={t('PR 代码与状态更新')}
                description={t('新提交、检查结果与流程状态变化的弹窗提醒。')}
              >
                <Toggle
                  label={t('PR 代码与状态更新提醒')}
                  checked={preferences.notifyCommits}
                  onChange={() => onChange({ notifyCommits: !preferences.notifyCommits })}
                />
              </SettingRow>
              <SettingRow
                title={t('普通评论更新')}
                description={t('新增评论、回复和评审动态的弹窗提醒。关闭后仍保留未读气泡。')}
              >
                <Toggle
                  label={t('普通评论更新提醒')}
                  checked={preferences.notifyComments}
                  onChange={() => onChange({ notifyComments: !preferences.notifyComments })}
                />
              </SettingRow>
              <h2 className="settings-section-heading">{t('呈现方式')}</h2>
              <SettingRow
                title={t('桌面通知')}
                description={t(
                  isDesktop
                    ? '应用运行时提醒，需要系统通知权限。'
                    : '桌面通知需要在 ThreadLine 桌面程序中开启。',
                )}
              >
                <Toggle
                  label={t('桌面通知')}
                  disabled={!isDesktop || requestingNotifications}
                  checked={isDesktop && preferences.desktopNotifications}
                  onChange={() => {
                    if (requestingNotifications) return;
                    setNotificationError('');
                    if (preferences.desktopNotifications) {
                      onChange({ desktopNotifications: false });
                      return;
                    }
                    setRequestingNotifications(true);
                    void enableDesktopNotifications()
                      .then(() => onChange({ desktopNotifications: true }))
                      .catch((reason) => setNotificationError(String(reason)))
                      .finally(() => setRequestingNotifications(false));
                  }}
                />
              </SettingRow>
              {isDesktop && preferences.desktopNotifications && (
                <SettingRow title={t('测试桌面通知')}>
                  <button
                    className="setting-value"
                    onClick={() => {
                      setNotificationError('');
                      setNotificationResult('正在发送测试通知…');
                      void notifyDesktop(
                        'ThreadLine · 测试通知',
                        '桌面通知已连接。真实新动态将在同步后按你的提醒设置发送。',
                      )
                        .then(() => setNotificationResult('已向系统发送测试通知，请查看通知中心。'))
                        .catch((reason) => {
                          setNotificationResult('');
                          setNotificationError(String(reason));
                        });
                    }}
                  >
                    {t('发送测试通知')}
                  </button>
                </SettingRow>
              )}
              <SettingRow title={t('通知声音')}>
                <Toggle
                  label={t('通知声音')}
                  checked={preferences.notificationSoundEnabled}
                  onChange={() =>
                    onChange({ notificationSoundEnabled: !preferences.notificationSoundEnabled })
                  }
                />
              </SettingRow>
              <SettingRow title={t('通知音效')}>
                <div className="notification-sound-controls">
                  <select
                    className="setting-value"
                    aria-label={t('通知音效')}
                    value={preferences.notificationSound}
                    onChange={(event) =>
                      onChange({ notificationSound: event.target.value as NotificationSound })
                    }
                  >
                    {notificationSounds.map((sound, index) => (
                      <option key={sound} value={sound}>
                        {t(['轻提示', '清铃', '双音'][index])}
                      </option>
                    ))}
                  </select>
                  <button
                    className="chip"
                    disabled={previewingSound}
                    onClick={() => {
                      setNotificationError('');
                      setPreviewingSound(true);
                      void playNotificationSound(preferences.notificationSound)
                        .catch((reason) => setNotificationError(String(reason)))
                        .finally(() => setPreviewingSound(false));
                    }}
                  >
                    {t('试听')}
                  </button>
                </div>
              </SettingRow>
              <SettingRow title={t('静默时段')} description={t('在设定时间内不弹出工具本地提醒。')}>
                <div className="quiet-hours">
                  <input
                    type="time"
                    aria-label={t('静默开始时间')}
                    value={preferences.quietStart}
                    onChange={(event) => {
                      if (event.target.validity.valid && event.target.value)
                        onChange({ quietStart: event.target.value });
                    }}
                  />
                  <span>–</span>
                  <input
                    type="time"
                    aria-label={t('静默结束时间')}
                    value={preferences.quietEnd}
                    onChange={(event) => {
                      if (event.target.validity.valid && event.target.value)
                        onChange({ quietEnd: event.target.value });
                    }}
                  />
                </div>
              </SettingRow>
              {requestingNotifications && <p role="status">{t('正在申请系统通知权限…')}</p>}
              {notificationError && <p role="alert">{t(notificationError)}</p>}
              {notificationResult && <p role="status">{t(notificationResult)}</p>}
            </>
          ) : (
            <Suspense fallback={<p role="status">{t('正在显示内容…')}</p>}>
              <AppearanceSettings preferences={preferences} onChange={onChange} />
            </Suspense>
          )}
        </section>
      </div>
    </>
  );
}
