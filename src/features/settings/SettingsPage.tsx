import { UpdatesPanel } from './UpdatesPanel';
import type { useUpdates } from '../../lib/useUpdates';
import { Modal } from '../../components/Modal';
import { useRef, useState, type ReactNode } from 'react';
import type { Preferences } from '../../core/workspace';
import type { AppState } from '../../lib/desktop';
import type { GitHubWorkspace } from '../../lib/useGitHub';
import type { PerformanceSample } from '../../lib/useGitHubResource';
import { enableDesktopNotifications, notifyDesktop } from '../../lib/notifications';
import { PageHeader } from '../../components/PageHeader';
import { GitHubLoginButton } from '../states/GitHubLogin';

const sections = [
  ['account', '账号与连接'],
  ['repositories', '仓库与同步'],
  ['notifications', '通知'],
  ['appearance', '外观'],
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
  return (
    <div className="setting-row">
      <div className="setting-text">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
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
  return (
    <button
      className={`toggle-switch ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
    >
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
      <span className="toggle-label">{checked ? '开启' : '关闭'}</span>
    </button>
  );
}

export function SettingsPage({
  preferences,
  updates,
  flush = async () => {},
  performanceSamples = [],
  onChange,
  onConnect,
  onSync,
  appState,
  github,
  onChooseRepository,
}: {
  preferences: Preferences;
  updates?: ReturnType<typeof useUpdates>;
  flush?: () => Promise<void>;
  performanceSamples?: PerformanceSample[];
  onChange: (change: Partial<Preferences>) => void;
  onConnect: () => void;
  onSync: () => void;
  appState: AppState | null;
  github: GitHubWorkspace;
  onChooseRepository: () => void;
}) {
  const [notificationError, setNotificationError] = useState('');
  const [notificationResult, setNotificationResult] = useState('');
  const [requestingNotifications, setRequestingNotifications] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const cancelLogout = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState<Section>('account');

  const title = sections.find(([id]) => id === section)![1];
  return (
    <>
      {confirmLogout && (
        <Modal
          title="退出 ThreadLine 登录？"
          onClose={() => setConfirmLogout(false)}
          initialFocusRef={cancelLogout}
        >
          <p>
            退出会删除本机保存的登录凭据和账号缓存，下次使用时需要重新授权 GitHub。你的 GitHub
            数据不会被删除。
          </p>
          <div className="inline-group settings-signout-actions">
            <button ref={cancelLogout} className="chip" onClick={() => setConfirmLogout(false)}>
              取消
            </button>
            <button
              className="chip settings-danger"
              onClick={() => {
                setConfirmLogout(false);
                void github.disconnect();
              }}
            >
              确认退出登录
            </button>
          </div>
        </Modal>
      )}
      <PageHeader title={title} />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          {sections.map(([id, label]) => (
            <button
              key={id}
              className={section === id ? 'active' : ''}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {section === 'updates' ? (
            <>
              {updates && <UpdatesPanel updates={updates} flush={flush} />}
              <SettingRow title="自动检查更新" description="每 6 小时检查一次，安装前由你确认。">
                <Toggle
                  label="自动检查更新"
                  disabled={updates?.status === 'unavailable'}
                  checked={preferences.autoCheckUpdates}
                  onChange={() => onChange({ autoCheckUpdates: !preferences.autoCheckUpdates })}
                />
              </SettingRow>
            </>
          ) : section === 'account' ? (
            <>
              <h2 className="settings-section-heading">GitHub 连接</h2>
              <SettingRow
                title={github.session ? `@${github.session.user.login}` : '尚未连接 GitHub'}
              >
                <button
                  className="setting-value accent"
                  disabled={github.connecting || github.auth.busy}
                  onClick={onConnect}
                >
                  {github.connecting ? '正在检查…' : github.session ? '检查连接' : '连接 GitHub ↗'}
                </button>
              </SettingRow>
              <GitHubLoginButton github={github} />
              {github.session && (
                <div className="settings-signout">
                  <button className="chip settings-danger" onClick={() => setConfirmLogout(true)}>
                    退出 ThreadLine 登录
                  </button>
                </div>
              )}
              <SettingRow title="权限范围" description="只读访问，不会修改 GitHub 数据。">
                <span className="muted">独立只读授权</span>
              </SettingRow>
              <SettingRow
                title="代码与仓库访问"
                description="可读取公开仓库；私有仓库需要单独安装并选择授权范围。"
              >
                <span className="muted">{github.repo || '尚未选择仓库'}</span>
              </SettingRow>
              <details className="storage-details">
                <summary>本地数据存储</summary>
                <p>
                  {appState
                    ? `SQLite v${appState.schemaVersion} · ${appState.databasePath}`
                    : '浏览器预览使用本地存储；桌面应用使用 SQLite。'}
                </p>
              </details>
              <details className="storage-details">
                <summary>加载诊断</summary>
                <p>
                  记录当前工作区最近的加载。客户端等待包含服务端读取与传输；复用进行中的请求时只计剩余等待。界面提交不包含屏幕刷新或电脑操作工具的耗时。
                </p>
                {!performanceSamples.length && <p>打开 PR 或 Issue 后会显示分段耗时。</p>}
                {performanceSamples.slice(-12).map((sample, index) => (
                  <div className="performance-sample" key={index}>
                    <p>
                      {(
                        {
                          pull: 'PR 概览',
                          discussion: '讨论',
                          files: '文件',
                          checks: '检查',
                          issue: 'Issue',
                        } as Partial<Record<string, string>>
                      )[sample.operation] ?? sample.operation}{' '}
                      ·{' '}
                      {sample.source === 'memory'
                        ? '已加载内容'
                        : sample.source === 'disk'
                          ? '本地缓存'
                          : '最新读取'}
                    </p>
                    <p>
                      客户端等待 {Math.round(sample.requestMs)} ms · 界面提交{' '}
                      {Math.round(sample.uiCommitMs)} ms
                      {sample.timing ? ` · 服务端 ${Math.round(sample.timing.totalMs)} ms` : ''}
                    </p>
                    {sample.timing && (
                      <p>
                        {sample.timing.stages
                          .map(
                            (stage) =>
                              `${({ credentials: '凭据', access: '访问校验', data: '数据读取', sessionRecheck: '会话复核', cacheWrite: '本地保存' } as Record<string, string>)[stage.stage] ?? stage.stage} ${Math.round(stage.elapsedMs)} ms`,
                          )
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </details>
            </>
          ) : section === 'repositories' ? (
            <>
              <h2 className="settings-section-heading">仓库</h2>
              <SettingRow title={github.repo || '尚未选择仓库'}>
                <span className="muted">{github.repo ? '已选择' : '未选择'}</span>
              </SettingRow>
              <SettingRow title="选择仓库" description="仅显示已授权仓库。">
                <button className="setting-value accent" onClick={onChooseRepository}>
                  选择仓库
                </button>
              </SettingRow>
              <h2 className="settings-section-heading">同步偏好</h2>
              <SettingRow title="自动刷新">
                <select
                  className="setting-value accent"
                  aria-label="自动刷新频率"
                  value={preferences.refreshMinutes}
                  onChange={(event) =>
                    onChange({
                      refreshMinutes: Number(event.target.value) as Preferences['refreshMinutes'],
                    })
                  }
                >
                  <option value={0}>手动刷新</option>
                  <option value={1}>每 1 分钟</option>
                  <option value={5}>每 5 分钟</option>
                  <option value={15}>每 15 分钟</option>
                </select>
              </SettingRow>
              <SettingRow title="最近同步">
                <span className="muted">
                  {Object.values(github.times).length
                    ? new Date(Math.max(...Object.values(github.times))).toLocaleString('zh-CN')
                    : '尚未同步'}
                </span>
              </SettingRow>
              <SettingRow title="手动刷新" description="刷新失败时保留本地缓存。">
                <button
                  className="setting-value accent"
                  disabled={github.syncing || !github.session || !github.repo}
                  onClick={onSync}
                >
                  {github.syncing ? '正在刷新…' : '立即刷新'}
                </button>
              </SettingRow>
              <p className="settings-note">
                同步只影响本工具中的展示，不会修改 PR、Issue 或 GitHub 订阅。
              </p>
            </>
          ) : section === 'notifications' ? (
            <>
              <h2 className="settings-section-heading">提醒类型</h2>
              <SettingRow title="需要我处理" description="请求修改、提及我以及需要回复的讨论。">
                <Toggle
                  label="需要我处理的提醒"
                  checked={preferences.notifyAttention}
                  onChange={() => onChange({ notifyAttention: !preferences.notifyAttention })}
                />
              </SettingRow>
              <SettingRow
                title="PR 代码与状态更新"
                description="新提交、检查结果与流程状态变化的弹窗提醒。"
              >
                <Toggle
                  label="PR 代码与状态更新提醒"
                  checked={preferences.notifyCommits}
                  onChange={() => onChange({ notifyCommits: !preferences.notifyCommits })}
                />
              </SettingRow>
              <SettingRow
                title="普通评论更新"
                description="新增评论、回复和评审动态的弹窗提醒。关闭后仍保留未读气泡。"
              >
                <Toggle
                  label="普通评论更新提醒"
                  checked={preferences.notifyComments}
                  onChange={() => onChange({ notifyComments: !preferences.notifyComments })}
                />
              </SettingRow>
              <h2 className="settings-section-heading">呈现方式</h2>
              <SettingRow title="桌面通知" description="应用运行时提醒，需要系统通知权限。">
                <Toggle
                  label="桌面通知"
                  disabled={requestingNotifications}
                  checked={preferences.desktopNotifications}
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
              {preferences.desktopNotifications && (
                <SettingRow title="测试桌面通知">
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
                    发送测试通知
                  </button>
                </SettingRow>
              )}
              <SettingRow title="静默时段" description="在设定时间内不弹出工具本地提醒。">
                <div className="quiet-hours">
                  <input
                    type="time"
                    aria-label="静默开始时间"
                    value={preferences.quietStart}
                    onChange={(event) => {
                      if (event.target.validity.valid && event.target.value)
                        onChange({ quietStart: event.target.value });
                    }}
                  />
                  <span>–</span>
                  <input
                    type="time"
                    aria-label="静默结束时间"
                    value={preferences.quietEnd}
                    onChange={(event) => {
                      if (event.target.validity.valid && event.target.value)
                        onChange({ quietEnd: event.target.value });
                    }}
                  />
                </div>
              </SettingRow>
              {requestingNotifications && <p role="status">正在申请系统通知权限…</p>}
              {notificationError && <p role="alert">{notificationError}</p>}
              {notificationResult && <p role="status">{notificationResult}</p>}
              <p className="settings-note">
                未读气泡始终更新。提醒类型与静默时段仅控制弹窗；首次导入不弹窗。应用退出或设为手动刷新后不会自动提醒。
              </p>
            </>
          ) : (
            <>
              <h2 className="settings-section-heading">主题预览</h2>
              <div className="theme-options" role="group" aria-label="主题">
                {(
                  [
                    ['dark', '深色'],
                    ['light', '浅色'],
                    ['system', '跟随系统'],
                  ] as const
                ).map(([theme, label]) => (
                  <button
                    key={theme}
                    className={`theme-option ${preferences.theme === theme ? 'active' : ''}`}
                    aria-pressed={preferences.theme === theme}
                    onClick={() => onChange({ theme })}
                  >
                    <span className={`theme-miniature preview-${theme}`} aria-hidden="true">
                      <span className="mini-sidebar" />
                      <span className="mini-content">
                        <i />
                        <i />
                        <i />
                      </span>
                    </span>
                    <span>
                      {label}
                      {preferences.theme === theme ? ' ✓' : ''}
                    </span>
                  </button>
                ))}
              </div>
              <h2 className="settings-section-heading">界面偏好</h2>
              <SettingRow title="信息密度">
                <select
                  className="setting-value accent"
                  aria-label="信息密度"
                  value={preferences.density}
                  onChange={(event) =>
                    onChange({ density: event.target.value as Preferences['density'] })
                  }
                >
                  <option value="comfortable">舒适</option>
                  <option value="compact">紧凑</option>
                </select>
              </SettingRow>

              <SettingRow title="减少动效">
                <Toggle
                  label="减少动效"
                  checked={preferences.reducedMotion}
                  onChange={() => onChange({ reducedMotion: !preferences.reducedMotion })}
                />
              </SettingRow>
            </>
          )}
        </section>
      </div>
    </>
  );
}
