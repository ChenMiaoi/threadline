import { useEffect, useMemo, useRef, useState } from 'react';
import { isDesktop, loadAppState, saveLastView, type AppState, type View } from './lib/desktop';
import { browserWorkspaceRepository, desktopWorkspaceRepository } from './lib/workspace-storage';
import { useWorkspace } from './lib/useWorkspace';
import { restoreSnoozes, type Preferences } from './core/workspace';
import { WorkspaceShell } from './components/WorkspaceShell';
import { Modal } from './components/Modal';
import { AuthoredPage } from './features/pulls/AuthoredPage';
import { PullDetailPage } from './features/pulls/PullDetailPage';
import type { PullRequest } from './features/pulls/model';
import { demoPulls } from './features/pulls/demo';
import { ActivityPage } from './features/activity/ActivityPage';
import { demoActivities } from './features/activity/demo';
import type { Activity } from './features/activity/model';
import { SettingsPage } from './features/settings/SettingsPage';
import {
  EmptyInboxPage,
  OnboardingPage,
  SnoozeDialog,
  SnoozedPage,
  SyncErrorPage,
} from './features/states/WorkspaceStates';
import './features/pulls/pulls.css';
import './features/activity/activity.css';
import './features/settings/settings.css';
import './features/states/states.css';

export default function App() {
  const [view, setView] = useState<View>('authored');
  const [openedPull, setOpenedPull] = useState<PullRequest | null>(null);
  const [recordPreview, setRecordPreview] = useState<Activity | null>(null);
  const [snoozeIds, setSnoozeIds] = useState<string[] | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(isDesktop);
  const [error, setError] = useState('');
  const [inboxFilter, setInboxFilter] = useState('unread');
  const [systemLight, setSystemLight] = useState(
    () => window.matchMedia('(prefers-color-scheme: light)').matches,
  );
  const repository = useMemo(
    () =>
      isDesktop ? desktopWorkspaceRepository() : browserWorkspaceRepository(window.localStorage),
    [],
  );
  const workspace = useWorkspace(repository);
  const { data, update } = workspace;
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => setSystemLight(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

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
    setRecordPreview(null);
    setView(next);
    if (next === 'inbox') setInboxFilter('unread');
    if (isDesktop && appState)
      writeQueue.current = writeQueue.current
        .then(() => saveLastView(next))
        .catch((reason) => setError(String(reason)));
  }

  function toggleRead(id: string) {
    update((current) => ({
      ...current,
      read: current.read.includes(id)
        ? current.read.filter((value) => value !== id)
        : [...current.read, id],
    }));
  }

  function openActivity(record: Activity) {
    if (record.kind === 'pull' && record.number === 1042) setOpenedPull(demoPulls[0]);
    else setRecordPreview(record);
  }

  function openPull(pull: PullRequest) {
    if (pull.number === 1042) {
      setOpenedPull(pull);
      return;
    }
    const record = Object.values(demoActivities)
      .flat()
      .find((item) => item.number === pull.number);
    if (record) setRecordPreview(record);
  }

  function changePreferences(change: Partial<Preferences>) {
    update((current) => ({ ...current, preferences: { ...current.preferences, ...change } }));
  }

  const light =
    data.preferences.theme === 'light' || (data.preferences.theme === 'system' && systemLight);
  const busy = loading || !workspace.loaded;
  const unread = demoActivities.inbox.filter(
    (item) => !data.read.includes(item.id) && !(item.id in data.snoozed),
  ).length;
  const className = `${light ? 'theme-light' : ''} density-${data.preferences.density} ${data.preferences.reducedMotion ? 'reduced-motion' : ''}`;

  return (
    <div className={`workspace-root ${className}`}>
      <WorkspaceShell
        view={view}
        unread={unread}
        onNavigate={navigate}
        loading={busy}
        className={className}
        onSearch={() => {
          navigate('authored');
          requestAnimationFrame(() =>
            document.querySelector<HTMLInputElement>('[aria-label="搜索 PR"]')?.focus(),
          );
        }}
      >
        {(error || workspace.error) && (
          <div role="alert" className="error">
            本地数据访问失败：{error || workspace.error}。请重新打开工作区后重试。
          </div>
        )}
        {busy ? (
          <div className="empty-state" role="status">
            正在打开本地工作区…
          </div>
        ) : (
          <>
            <div className="page-view" hidden={Boolean(openedPull)}>
              {view === 'authored' ? (
                <AuthoredPage onOpen={openPull} read={data.read} onRead={toggleRead} />
              ) : view === 'settings' ? (
                <SettingsPage
                  preferences={data.preferences}
                  onChange={changePreferences}
                  onConnect={() => navigate('onboarding')}
                  onSync={() => navigate('sync-error')}
                  appState={appState}
                />
              ) : view === 'onboarding' ? (
                <OnboardingPage onExample={() => navigate('authored')} />
              ) : view === 'empty' ? (
                <EmptyInboxPage
                  onShowAll={() => {
                    navigate('inbox');
                    setInboxFilter('all');
                  }}
                />
              ) : view === 'sync-error' ? (
                <SyncErrorPage onConnect={() => navigate('settings')} onOpen={openActivity} />
              ) : view === 'snoozed' ? (
                <SnoozedPage
                  data={data}
                  onRestore={(ids) => update((current) => restoreSnoozes(current, ids))}
                  onAdjust={setSnoozeIds}
                  onOpen={openActivity}
                />
              ) : (
                <ActivityPage
                  key={`${view}-${inboxFilter}`}
                  view={view}
                  read={data.read}
                  snoozed={Object.keys(data.snoozed)}
                  onRead={toggleRead}
                  onSnooze={(id) => setSnoozeIds([id])}
                  onOpen={openActivity}
                  initialFilter={view === 'inbox' ? inboxFilter : undefined}
                />
              )}
            </div>
            {openedPull && (
              <PullDetailPage
                key={openedPull.number}
                pull={openedPull}
                onBack={() => setOpenedPull(null)}
              />
            )}
          </>
        )}
      </WorkspaceShell>
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
              {data.read.includes(recordPreview.id) ? '标记未读' : '标记已读'}
            </button>
            <button
              className="chip"
              onClick={() => {
                setSnoozeIds([recordPreview.id]);
                setRecordPreview(null);
              }}
            >
              稍后处理
            </button>
          </div>
        </Modal>
      )}
      {snoozeIds && (
        <SnoozeDialog
          count={snoozeIds.length}
          onClose={() => setSnoozeIds(null)}
          onConfirm={(until) => {
            update((current) => ({
              ...current,
              snoozed: {
                ...current.snoozed,
                ...Object.fromEntries(snoozeIds.map((id) => [id, until])),
              },
              restored: current.restored.filter((id) => !snoozeIds.includes(id)),
            }));
            setSnoozeIds(null);
          }}
        />
      )}
    </div>
  );
}
