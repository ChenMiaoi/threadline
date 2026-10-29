import { useState, type ReactNode } from 'react';
import type { Preferences } from '../../core/workspace';
import type { AppState } from '../../lib/desktop';
import type { GitHubWorkspace } from '../../lib/useGitHub';
import { GitHubLoginButton } from '../states/GitHubLogin';

const sections = [
  ['account', '账号与连接'],
  ['repositories', '仓库与同步'],
  ['notifications', '通知'],
  ['appearance', '外观'],
] as const;
type Section = (typeof sections)[number][0];

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className={`setting-value ${checked ? 'accent' : 'muted'}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
    >
      {checked ? '开启 ●' : '关闭 ○'}
    </button>
  );
}

export function SettingsPage({
  preferences,
  onChange,
  onConnect,
  onSync,
  appState,
  github,
  onChooseRepository,
}: {
  preferences: Preferences;
  onChange: (change: Partial<Preferences>) => void;
  onConnect: () => void;
  onSync: () => void;
  appState: AppState | null;
  github: GitHubWorkspace;
  onChooseRepository: () => void;
}) {
  const [section, setSection] = useState<Section>('account');

  const title = sections.find(([id]) => id === section)![1];
  const descriptions: Record<Section, string> = {
    account: '管理 GitHub 账号与连接状态。',
    repositories: '控制工作区展示的仓库与同步偏好。',
    notifications: '仅管理 ThreadLine 的本地提醒偏好，不改变 GitHub 通知订阅。',
    appearance: '选择主题、信息密度与界面语言。当前主题会立即应用到工作区。',
  };
  return (
    <>
      <header className="location">
        <span>ThreadLine</span>
        <span className="separator">/</span>
        <span className="muted">设置 / {title}</span>
        <span className="connection-badge">
          {github.session ? `@${github.session.user.login}` : '未连接 GitHub'}
        </span>
      </header>
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
          <h1>{title}</h1>
          <p className="settings-description">{descriptions[section]}</p>
          {section === 'account' ? (
            <>
              <h2 className="settings-section-heading">GitHub 连接</h2>
              <SettingRow
                title={github.session ? `@${github.session.user.login}` : '尚未连接 GitHub'}
                description="复用 gh 的活动账号，切换 gh 账号后请重新检查连接。"
              >
                <button className="setting-value accent" onClick={onConnect}>
                  {github.session ? '重新检查连接' : '连接 GitHub ↗'}
                </button>
              </SettingRow>
              <GitHubLoginButton github={github} />
              <SettingRow
                title="权限范围"
                description="读取 PR、Issue、评论、正式评审和通知元数据。"
              >
                <span className="muted">由 gh 当前凭据决定</span>
              </SettingRow>
              <SettingRow title="代码与仓库访问" description="仅访问 gh 账号有权限读取的仓库。">
                <span className="muted">{github.repo || '尚未选择仓库'}</span>
              </SettingRow>
              <h2 className="settings-section-heading">本地信息</h2>
              <SettingRow title="显示身份" description="GitHub API 返回的真实账号身份。">
                <span className="muted">{github.session?.user.login ?? '未连接'}</span>
              </SettingRow>
              <p className="settings-note">
                ThreadLine 不读取或保存令牌。授权由 GitHub 确认，登录凭据由 GitHub CLI 管理。
              </p>
              <details className="storage-details">
                <summary>本地数据存储</summary>
                <p>
                  {appState
                    ? `SQLite v${appState.schemaVersion} · ${appState.databasePath}`
                    : '浏览器预览使用本地存储；桌面应用使用 SQLite。'}
                </p>
              </details>
            </>
          ) : section === 'repositories' ? (
            <>
              <h2 className="settings-section-heading">仓库</h2>
              <SettingRow
                title={github.repo || '尚未选择仓库'}
                description="当前账号的协作记录按所选仓库读取。"
              >
                <span className="muted">{github.repo ? '已选择' : '未选择'}</span>
              </SettingRow>
              <SettingRow title="选择仓库" description="连接完成后，仅列出授权范围内可选择的仓库。">
                <button className="setting-value accent" onClick={onChooseRepository}>
                  选择仓库
                </button>
              </SettingRow>
              <h2 className="settings-section-heading">同步偏好</h2>
              <SettingRow
                title="自动刷新"
                description="保存工作区打开时的刷新频率；连接 GitHub 后生效。"
              >
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
              <SettingRow title="最近同步" description="各页面的最后成功读取时间。">
                <span className="muted">
                  {Object.values(github.times).length
                    ? new Date(Math.max(...Object.values(github.times))).toLocaleString('zh-CN')
                    : '尚未同步'}
                </span>
              </SettingRow>
              <SettingRow
                title="手动刷新"
                description="读取所选仓库的最新信息；失败时保留可用的本地缓存。"
              >
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
              <SettingRow title="评审后有新提交" description="对比上次正式评审的 SHA 与当前 HEAD。">
                <Toggle
                  label="评审后有新提交的提醒"
                  checked={preferences.notifyCommits}
                  onChange={() => onChange({ notifyCommits: !preferences.notifyCommits })}
                />
              </SettingRow>
              <SettingRow title="普通评论更新" description="将新增普通评论加入工具内收件箱。">
                <Toggle
                  label="普通评论更新提醒"
                  checked={preferences.notifyComments}
                  onChange={() => onChange({ notifyComments: !preferences.notifyComments })}
                />
              </SettingRow>
              <h2 className="settings-section-heading">呈现方式</h2>
              <SettingRow
                title="桌面通知"
                description="仅保存偏好；未申请系统通知权限，也不会发送通知。"
              >
                <Toggle
                  label="桌面通知偏好"
                  checked={preferences.desktopNotifications}
                  onChange={() =>
                    onChange({ desktopNotifications: !preferences.desktopNotifications })
                  }
                />
              </SettingRow>
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
              <p className="settings-note">偏好保存在本地。尚未接入真实提醒，不会更改系统权限。</p>
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
              <SettingRow title="信息密度" description="在清晰阅读与紧凑浏览之间选择。">
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
              <SettingRow title="语言" description="界面文案语言；仓库内容保持原文。">
                <span className="accent">简体中文</span>
              </SettingRow>
              <SettingRow title="减少动效" description="降低页面切换与状态变化的动效。">
                <Toggle
                  label="减少动效"
                  checked={preferences.reducedMotion}
                  onChange={() => onChange({ reducedMotion: !preferences.reducedMotion })}
                />
              </SettingRow>
              <p className="settings-note">外观偏好只影响 ThreadLine，不会改变系统外观。</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
