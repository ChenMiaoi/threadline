import { useEffect, useRef, useState } from 'react';
import { isDesktop, loadAppState, saveLastView, type AppState, type View } from './lib/desktop';
import { Icon, IconButton } from './components/Icon';
import { AuthoredPage } from './features/pulls/AuthoredPage';
import { PullDetailPage } from './features/pulls/PullDetailPage';
import type { PullRequest } from './features/pulls/model';
import './features/pulls/pulls.css';

const navigation: { id: View; label: string; icon: string }[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox' },
  { id: 'authored', label: '我发起的', icon: 'user' },
  { id: 'review', label: '我审阅的', icon: 'review' },
  { id: 'issues', label: 'Issues', icon: 'issues' },
];

export default function App() {
  const [view, setView] = useState<View>('authored');
  const [openedPull, setOpenedPull] = useState<PullRequest | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(isDesktop);
  const [error, setError] = useState('');
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    loadAppState()
      .then((state) => {
        if (active) {
          setAppState(state);
          setView(state.lastView);
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function navigate(next: View) {
    setOpenedPull(null);
    setView(next);
    if (isDesktop && appState) {
      writeQueue.current = writeQueue.current
        .then(() => saveLastView(next))
        .catch((reason) => setError(String(reason)));
    }
  }

  const title = view === 'settings' ? '设置' : navigation.find((item) => item.id === view)!.label;

  return (
    <div className="app">
      <header className="app-bar">
        <div className="brand">
          <Icon name="brand" />
          <strong>ThreadLine</strong>
        </div>
        <IconButton
          name="search"
          label="搜索工作区"
          onClick={() => {
            navigate('authored');
            requestAnimationFrame(() =>
              document.querySelector<HTMLInputElement>('[aria-label="搜索 PR"]')?.focus(),
            );
          }}
        />
        <div className="workspace-switcher">
          <span>工作台</span>
          <span className="workspace-current">llvm-project</span>
        </div>
        <div className="account">
          <span className="avatar">C</span>
          <span>示例数据</span>
          <Icon name="chev" />
        </div>
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
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.id !== 'authored' && (
                  <span className="nav-count">
                    {item.id === 'inbox' ? 4 : item.id === 'review' ? 15 : 8}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="repository-section">
            <div className="section-label">仓库</div>
            <div className="repository-empty">
              <Icon name="repo" />
              <span>llvm-project</span>
            </div>
          </div>
          <button
            disabled={loading}
            className={`nav-item settings-link ${view === 'settings' ? 'selected' : ''}`}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
          >
            <Icon name="settings" />
            设置
          </button>
        </aside>
        <main className="content">
          {view !== 'authored' && !openedPull && (
            <header className="location">
              <span>ThreadLine</span>
              <span className="separator">/</span>
              <span className="muted">{title}</span>
              <span className="connection-badge">未连接 GitHub</span>
            </header>
          )}
          {error && (
            <div role="alert" className="error">
              本地数据访问失败：{error}
            </div>
          )}
          {loading ? (
            <div className="empty-state" role="status">
              正在打开本地工作区…
            </div>
          ) : openedPull ? (
            <PullDetailPage
              key={openedPull.number}
              pull={openedPull}
              onBack={() => setOpenedPull(null)}
            />
          ) : view === 'authored' ? (
            <AuthoredPage onOpen={setOpenedPull} />
          ) : view === 'settings' ? (
            <section className="settings-page">
              <h1>设置</h1>
              <p className="muted">管理 ThreadLine 的本地工作区。</p>
              <section className="settings-card">
                <h2>本地数据</h2>
                <dl>
                  <dt>运行环境</dt>
                  <dd>{isDesktop ? 'Tauri 桌面应用' : '浏览器预览'}</dd>
                  <dt>存储状态</dt>
                  <dd>
                    {appState
                      ? `SQLite 已就绪 · v${appState.schemaVersion}`
                      : isDesktop
                        ? '无法读取数据库'
                        : '请在桌面应用中使用 SQLite'}
                  </dd>
                  {appState && (
                    <>
                      <dt>数据库位置</dt>
                      <dd className="database-path">{appState.databasePath}</dd>
                    </>
                  )}
                </dl>
                <p className="muted">桌面端自动保存上次打开的页面。</p>
              </section>
              <section className="settings-card">
                <h2>GitHub</h2>
                <p className="muted">尚未连接。账号授权与仓库同步将在后续实现。</p>
              </section>
            </section>
          ) : (
            <section className="empty-state">
              <div className="empty-symbol">
                <Icon name={navigation.find((item) => item.id === view)!.icon} />
              </div>
              <h1>连接 GitHub，开始协作</h1>
              <p>
                在这里关注
                {view === 'inbox'
                  ? '需要你处理的更新'
                  : view === 'review'
                    ? '等待你审阅的 Pull Request'
                    : '仓库中的 Issues'}
                。
              </p>
              <button className="primary-button" onClick={() => navigate('settings')}>
                查看连接设置
              </button>
              <div className="context-card">
                <h2>从一个工作区开始</h2>
                <p>当前尚未接入 GitHub，暂无仓库或协作记录。账号连接与同步功能将在后续开放。</p>
              </div>
              <p className="footnote">ThreadLine · 本地优先的 GitHub 协作工作台</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
