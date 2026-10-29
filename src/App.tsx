import { useEffect, useRef, useState } from 'react';
import { isDesktop, loadAppState, saveLastView, type AppState, type View } from './lib/desktop';
import { Icon, IconButton } from './components/Icon';
import { AuthoredPage } from './features/pulls/AuthoredPage';
import { PullDetailPage } from './features/pulls/PullDetailPage';
import type { PullRequest } from './features/pulls/model';
import { demoPulls } from './features/pulls/demo';
import { ActivityPage } from './features/activity/ActivityPage';
import type { Activity } from './features/activity/model';
import { Modal } from './components/Modal';
import './features/pulls/pulls.css';
import './features/activity/activity.css';

const navigation: { id: View; label: string; icon: string }[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox' },
  { id: 'authored', label: '我发起的', icon: 'user' },
  { id: 'review', label: '我审阅的', icon: 'review' },
  { id: 'issues', label: 'Issues', icon: 'issues' },
];

export default function App() {
  const [view, setView] = useState<View>('authored');
  const [openedPull, setOpenedPull] = useState<PullRequest | null>(null);
  const [recordPreview, setRecordPreview] = useState<Activity | null>(null);
  const [read, setRead] = useState<string[]>([]);
  const [snoozed, setSnoozed] = useState<string[]>([]);
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

  function toggleRead(id: string) {
    setRead((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function openActivity(record: Activity) {
    if (record.kind === 'pull' && record.number === 1042) setOpenedPull(demoPulls[0]);
    else setRecordPreview(record);
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
          {view === 'settings' && !openedPull && (
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
            <ActivityPage
              key={view}
              view={view}
              read={read}
              snoozed={snoozed}
              onRead={toggleRead}
              onSnooze={(id) => setSnoozed((current) => [...current, id])}
              onOpen={openActivity}
            />
          )}
        </main>
      </div>
      {recordPreview && (
        <Modal
          title={`${recordPreview.kind === 'issue' ? 'Issue' : 'PR'} #${recordPreview.number}`}
          onClose={() => setRecordPreview(null)}
        >
          <h2>{recordPreview.title}</h2>
          <p>{recordPreview.summary}</p>
          <p>{recordPreview.detail}</p>
          <p className="dim">示例记录 · 未连接 GitHub</p>
          <div className="inline-group">
            <button className="chip" onClick={() => toggleRead(recordPreview.id)}>
              {read.includes(recordPreview.id) ? '标记未读' : '标记已读'}
            </button>
            <button
              className="chip"
              onClick={() => {
                setSnoozed((current) => [...current, recordPreview.id]);
                setRecordPreview(null);
              }}
            >
              稍后处理
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
