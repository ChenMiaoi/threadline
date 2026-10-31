import { useI18n } from '../i18n/I18n';
import type { ReactNode } from 'react';
import { Icon, IconButton } from './Icon';
import { isDesktop, isMacDesktop, type View } from '../lib/desktop';
import { GitHubAvatar } from './GitHubAvatar';
import { WindowControls } from './WindowControls';

const navigation: { id: View; label: string; icon: string; count?: number }[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox' },
  { id: 'snoozed', label: '稍后处理', icon: 'snoozed' },
  { id: 'authored', label: '我发起的', icon: 'user' },
  { id: 'review', label: '我审阅的', icon: 'review' },
  { id: 'issues', label: 'Issues', icon: 'issues' },
  { id: 'profile', label: '个人主页', icon: 'profile' },
];

export function WorkspaceShell({
  view,
  unread,
  onNavigate,
  onSearch,
  loading,
  children,
  repo,
  login,
  avatarUrl,
  repositoryAvatarUrl,
  counts,
  onChooseRepository,
  notificationsAvailable,
}: {
  view: View;
  unread: number;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  loading: boolean;
  children: ReactNode;
  repo: string;
  login?: string;
  avatarUrl?: string | null;
  repositoryAvatarUrl?: string | null;
  counts: { review: number; issues: number };
  onChooseRepository: () => void;
  notificationsAvailable: boolean;
}) {
  const { t } = useI18n();

  const dragRegion = isDesktop ? true : undefined;
  const [repositoryOwner, repositoryName] = repo.split('/');
  return (
    <div className="app">
      <header
        className={`app-bar${isDesktop ? ' desktop-app-bar' : ''}${isMacDesktop ? ' macos-app-bar' : ''}`}
        data-tauri-drag-region={dragRegion}
      >
        <div className="brand" data-tauri-drag-region={dragRegion}>
          <span data-tauri-drag-region={dragRegion}>
            <Icon name="brand" />
          </span>
          <strong data-tauri-drag-region={dragRegion}>ThreadLine</strong>
        </div>
        <div className="header-tools" data-tauri-drag-region={dragRegion}>
          <IconButton name="search" label={t('搜索我发起的 PR')} onClick={onSearch} />
          <div className="workspace-switcher">
            <button
              className="workspace-current"
              title={repo || t('选择仓库')}
              onClick={onChooseRepository}
            >
              <Icon name="repo" />
              <span>{repo || t('选择仓库')}</span>
              <Icon name="chev" />
            </button>
          </div>
        </div>
        <button
          className="account"
          onClick={() => onNavigate('settings')}
          aria-label={t('账号与连接设置')}
        >
          <GitHubAvatar login={login} url={avatarUrl} />
          <span className="account-name" title={login}>
            {login ?? '未连接'}
          </span>
          <Icon name="chev" />
        </button>
        <WindowControls />
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">{t('工作区')}</div>
          <nav aria-label={t('工作区')}>
            {navigation.map((item) => (
              <button
                key={item.id}
                title={t(item.label)}
                aria-label={item.id === 'snoozed' ? t('查看稍后处理') : undefined}
                disabled={loading}
                className={`nav-item ${view === item.id ? 'selected' : ''}`}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon name={item.icon} />
                <span className="nav-label">{t(item.label)}</span>
                {['inbox', 'review', 'issues'].includes(item.id) && (
                  <span
                    className={`nav-count ${item.id === 'inbox' && unread > 0 ? 'unread-bubble' : ''}`}
                  >
                    {item.id === 'inbox'
                      ? notificationsAvailable
                        ? unread
                        : '—'
                      : item.id === 'review'
                        ? counts.review
                        : counts.issues}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="repository-section">
            <div className="repository-section-heading">
              <div className="section-label">{t('仓库')}</div>
              <button
                type="button"
                className="repository-add"
                aria-label={t('添加仓库')}
                title={t('添加仓库')}
                onClick={onChooseRepository}
              >
                +
              </button>
            </div>
            <button
              className="repository-empty"
              aria-label={repo || t('选择仓库')}
              title={repo || t('选择仓库')}
              disabled={loading}
              onClick={() => (repo ? onNavigate('authored') : onChooseRepository())}
            >
              {repositoryOwner ? (
                <GitHubAvatar login={repositoryOwner} url={repositoryAvatarUrl} />
              ) : (
                <Icon name="repo" />
              )}
              <span className="repository-name">
                <strong>{repositoryName || t('选择仓库')}</strong>
                {repositoryOwner && <small>{repositoryOwner}</small>}
              </span>
            </button>
          </div>
          <button
            disabled={loading}
            title={t('设置')}
            className={`nav-item settings-link ${view === 'settings' ? 'selected' : ''}`}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => onNavigate('settings')}
          >
            <Icon name="settings" />
            <span className="nav-label">{t('设置')}</span>
          </button>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
