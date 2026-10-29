import { useRef, type ReactNode } from 'react';
import { Icon, IconButton } from './Icon';
import type { View } from '../lib/desktop';

const navigation: { id: View; label: string; icon: string; count?: number }[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox' },
  { id: 'authored', label: '我发起的', icon: 'user' },
  { id: 'review', label: '我审阅的', icon: 'review', count: 15 },
  { id: 'issues', label: 'Issues', icon: 'issues', count: 8 },
];

export function WorkspaceShell({
  view,
  unread,
  onNavigate,
  onSearch,
  className,
  loading,
  children,
}: {
  view: View;
  unread: number;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  className: string;
  loading: boolean;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  function choose(next: View) {
    menu.current?.removeAttribute('open');
    onNavigate(next);
  }
  return (
    <div className={`app ${className}`}>
      <header className="app-bar">
        <div className="brand">
          <Icon name="brand" />
          <strong>ThreadLine</strong>
        </div>
        <IconButton name="search" label="搜索工作区" onClick={onSearch} />
        <div className="workspace-switcher">
          <details className="workspace-menu" ref={menu}>
            <summary>工作台</summary>
            <nav aria-label="工作台页面" className="workspace-menu-items">
              <button onClick={() => choose('inbox')}>工具收件箱</button>
              <button onClick={() => choose('snoozed')}>稍后处理</button>
              <hr />
              <span className="menu-label">示例状态</span>
              <button onClick={() => choose('onboarding')}>首次连接</button>
              <button onClick={() => choose('empty')}>收件箱空状态</button>
              <button onClick={() => choose('sync-error')}>同步失败</button>
            </nav>
          </details>
          <button className="workspace-current" onClick={() => onNavigate('authored')}>
            llvm-project
          </button>
        </div>
        <button
          className="account"
          onClick={() => onNavigate('settings')}
          aria-label="账号与连接设置"
        >
          <span className="avatar">C</span>
          <span>示例数据</span>
          <Icon name="chev" />
        </button>
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
                {item.label}
                {item.id !== 'authored' && (
                  <span className="nav-count">{item.id === 'inbox' ? unread : item.count}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="repository-section">
            <div className="section-label">仓库</div>
            <button className="repository-empty" onClick={() => onNavigate('authored')}>
              <Icon name="repo" />
              <span>llvm-project</span>
            </button>
          </div>
          <button
            disabled={loading}
            className={`nav-item settings-link ${view === 'settings' ? 'selected' : ''}`}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => onNavigate('settings')}
          >
            <Icon name="settings" />
            设置
          </button>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
