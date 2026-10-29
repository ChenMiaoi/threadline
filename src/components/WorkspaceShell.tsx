import { useRef, type ReactNode } from 'react';
import { Icon, IconButton } from './Icon';
import { isDesktop, isMacDesktop, type View } from '../lib/desktop';
import { WindowControls } from './WindowControls';

const navigation: { id: View; label: string; icon: string; count?: number }[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox' },
  { id: 'authored', label: '我发起的', icon: 'user' },
  { id: 'review', label: '我审阅的', icon: 'review' },
  { id: 'issues', label: 'Issues', icon: 'issues' },
];

export function WorkspaceShell({
  view,
  unread,
  onNavigate,
  onSearch,
  className,
  loading,
  children,
  repo,
  login,
  counts,
  onChooseRepository,
}: {
  view: View;
  unread: number;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  className: string;
  loading: boolean;
  children: ReactNode;
  repo: string;
  login?: string;
  counts: { review: number; issues: number };
  onChooseRepository: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const dragRegion = isDesktop && !isMacDesktop ? true : undefined;
  function choose(next: View) {
    menu.current?.removeAttribute('open');
    onNavigate(next);
  }
  return (
    <div className={`app ${className}`}>
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
        <IconButton name="search" label="搜索工作区" onClick={onSearch} />
        <div className="workspace-switcher">
          <details className="workspace-menu" ref={menu}>
            <summary>工作台</summary>
            <nav aria-label="工作台页面" className="workspace-menu-items">
              <button aria-label="工具收件箱" onClick={() => choose('inbox')}>
                工具收件箱
              </button>
              <button aria-label="稍后处理" onClick={() => choose('snoozed')}>
                稍后处理
              </button>
            </nav>
          </details>
          <button
            className="workspace-current"
            title={repo || '选择仓库'}
            onClick={onChooseRepository}
          >
            {repo || '选择仓库'}
          </button>
        </div>
        <button
          className="account"
          onClick={() => onNavigate('settings')}
          aria-label="账号与连接设置"
        >
          <span className="avatar">{login?.slice(0, 1).toUpperCase() ?? '?'}</span>
          <span className="account-name" title={login}>
            {login ?? '未连接'}
          </span>
          <Icon name="chev" />
        </button>
        <WindowControls />
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">工作区</div>
          <nav aria-label="工作区">
            {navigation.map((item) => (
              <button
                key={item.id}
                disabled={loading}
                className={`nav-item ${view === item.id ? 'selected' : ''}`}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon name={item.icon} />
                <span className="nav-label">{item.label}</span>
                {item.id !== 'authored' && (
                  <span className="nav-count">
                    {item.id === 'inbox'
                      ? unread
                      : item.id === 'review'
                        ? counts.review
                        : counts.issues}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="repository-section">
            <div className="section-label">仓库</div>
            <button
              className="repository-empty"
              title={repo || '选择仓库'}
              onClick={onChooseRepository}
            >
              <Icon name="repo" />
              <span className="repository-name">{repo || '选择仓库'}</span>
            </button>
          </div>
          <button
            disabled={loading}
            className={`nav-item settings-link ${view === 'settings' ? 'selected' : ''}`}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => onNavigate('settings')}
          >
            <Icon name="settings" />
            <span className="nav-label">设置</span>
          </button>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
