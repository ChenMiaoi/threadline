import { FloatingWarning, FloatingWarnings } from './components/FloatingWarnings';
import { typographyStyle } from './lib/appearance';
import { I18nContext, useLanguage } from './i18n/I18n';
import { useUpdates } from './lib/useUpdates';
import { useRepositoryAvatar } from './lib/useRepositoryAvatar';
import { githubErrorMessage } from './lib/github-errors';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isDesktop, loadAppState, saveLastView, type AppState, type View } from './lib/desktop';
import { browserWorkspaceRepository, desktopWorkspaceRepository } from './lib/workspace-storage';
import { useWorkspace } from './lib/useWorkspace';
import {
  MAX_INBOX_REVISIONS,
  markRecordsRead,
  inboxReadIds,
  restoreSnoozes,
  workspaceInbox,
  type Preferences,
} from './core/workspace';
import { WorkspaceShell } from './components/WorkspaceShell';
import { AuthoredPage } from './features/pulls/AuthoredPage';
import { PullDetailPage } from './features/pulls/PullDetailPage';
import type { PullRequest } from './features/pulls/model';
import { useInboxNotifications } from './lib/useInboxNotifications';
import { useGitHub } from './lib/useGitHub';
import { createResourceCache } from './lib/useGitHubResource';
import { preloadGitHubMarkdown } from './lib/markdown';
import type { GitHubGateway } from './core/github';
import { GitHubConnection, RepositoryPicker } from './features/states/GitHubConnection';
import { GitHubLoginDialog } from './features/states/GitHubLogin';
import { IssuePreview } from './features/activity/IssuePreview';
import { ActivityPage } from './features/activity/ActivityPage';
import type { Activity } from './features/activity/model';
import { ProfilePage } from './features/profile/ProfilePage';
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
import { SnoozeDialog, SnoozedPage } from './features/states/WorkspaceStates';
import './features/pulls/pulls.css';
import './features/activity/activity.css';
import './features/settings/settings.css';
import './features/states/states.css';

export default function App({ gateway }: { gateway?: GitHubGateway }) {
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
  const language = useLanguage(data.preferences.language);
  const { t } = language;
  const updates = useUpdates(workspace.loaded && data.preferences.autoCheckUpdates);
  const github = useGitHub(data.preferences.refreshMinutes, gateway, 30);
  const repositoryAvatarUrl = useRepositoryAvatar(
    github.gateway,
    github.repo,
    github.session?.user.id,
  );
  const resourceCache = useMemo(() => createResourceCache(github.key), [github.key]);
  const profileCache = useMemo(
    () => createResourceCache(`profile-v2:${github.session?.user.id}:${github.repo}`),
    [github.session?.user.id, github.repo],
  );
  const [repositoryPicker, setRepositoryPicker] = useState(false);
  const listScroll = useRef(0);
  useLayoutEffect(() => {
    if (!openedPull) return;
    const content = document.querySelector<HTMLElement>('main.content');
    if (!content) return;
    content.scrollTop = 0;
    return () => {
      content.scrollTop = listScroll.current;
    };
  }, [openedPull]);
  const completedLogin = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  const { restored, snoozeRecords } = data;
  const inbox = useMemo(
    () =>
      workspaceInbox(
        github.inbox,
        { restored, snoozeRecords },
        `github:${github.session?.user.id}:${github.repo}:`,
      ),
    [github.inbox, github.session?.user.id, github.repo, restored, snoozeRecords],
  );
  const notices = useInboxNotifications(github, inbox, workspace);
  const effectiveReadIds = useMemo(
    () => inboxReadIds(inbox, data.read, data.unread),
    [inbox, data.read, data.unread],
  );
  const effectiveRead = useMemo(() => [...effectiveReadIds], [effectiveReadIds]);
  const snoozedIds = useMemo(() => Object.keys(data.snoozed), [data.snoozed]);
  function chooseRepository() {
    if (!github.session) {
      navigate('onboarding');
      return;
    }
    setRepositoryPicker(true);
    void github.listRepositories();
  }

  useEffect(() => {
    if (github.auth.state.status !== 'complete') {
      completedLogin.current = false;
      return;
    }
    if (github.connecting || !github.session || github.connectionError || completedLogin.current)
      return;
    const timer = window.setTimeout(() => {
      completedLogin.current = true;
      setRepositoryPicker(true);
      void github.listRepositories();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [github]);

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
    listScroll.current = 0;
    const content = document.querySelector<HTMLElement>('main.content');
    if (content) content.scrollTop = 0;
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
    const record = inbox.find((record) => record.id === id);
    const pull = github.pulls.find(
      (pull) => pull.id === id || (record?.kind === 'pull' && record.number === pull.number),
    );
    const targets = [
      id,
      ...(pull?.id ? [pull.id] : []),
      ...(pull
        ? github.inbox
            .filter((record) => record.kind === 'pull' && record.number === pull.number)
            .map((record) => record.id)
        : []),
    ];
    const isRead = effectiveReadIds.has(id);
    update((current) => ({
      ...current,
      read: isRead
        ? current.read.filter((value) => !targets.includes(value))
        : [...new Set([...current.read, ...targets])].slice(-MAX_INBOX_REVISIONS),
      unread: isRead
        ? [...new Set([...current.unread, ...targets])].slice(-2000)
        : current.unread.filter((value) => !targets.includes(value)),
    }));
  }
  function openActivity(record: Activity) {
    if (!effectiveReadIds.has(record.id))
      update((current) => ({
        ...current,
        read: [
          ...new Set([
            ...current.read,
            record.id,
            ...github.pulls
              .filter((pull) => record.kind === 'pull' && pull.number === record.number)
              .flatMap((pull) => (pull.id ? [pull.id] : [])),
          ]),
        ].slice(-2000),
        unread: current.unread.filter((id) => id !== record.id),
      }));
    preloadGitHubMarkdown();
    if (record.kind === 'pull') {
      listScroll.current = document.querySelector<HTMLElement>('main.content')?.scrollTop ?? 0;
      setOpenedPull({
        ...(github.pulls.find((pull) => pull.number === record.number) ?? {
          number: record.number,
          title: record.title,
          id: record.id,
          url: record.url,
          state:
            record.state === 'merged' ? 'merged' : record.state === 'closed' ? 'closed' : 'open',
          presentation: record.pullStatus,
          group: record.group,
          status: record.status,
          tone: 'muted',
          check: 'none',
          reviewer: '',
          updated: record.updated,
          updatedAt: record.updatedAt,
          headSha: record.headSha,
        }),
        updatedAt: record.updatedAt,
        headSha: record.headSha,
      });
    } else setRecordPreview(record);
  }
  function openPull(pull: PullRequest) {
    listScroll.current = document.querySelector<HTMLElement>('main.content')?.scrollTop ?? 0;
    preloadGitHubMarkdown();
    setOpenedPull(pull);
  }

  function changePreferences(change: Partial<Preferences>) {
    update((current) => ({ ...current, preferences: { ...current.preferences, ...change } }));
  }

  const light =
    data.preferences.theme === 'light' || (data.preferences.theme === 'system' && systemLight);
  const busy = loading || (!workspace.loaded && !workspace.error);
  const unread = useMemo(
    () =>
      inbox.filter((item) => !effectiveReadIds.has(item.id) && !(item.id in data.snoozed)).length,
    [inbox, effectiveReadIds, data.snoozed],
  );
  const records = useMemo(
    () => [...inbox, ...github.review, ...github.issues],
    [inbox, github.review, github.issues],
  );
  const currentPage =
    view === 'authored' || view === 'inbox' || view === 'review' || view === 'issues' ? view : null;
  const syncError =
    (github.session ? github.connectionError : '') ||
    (currentPage
      ? github.errors[currentPage] ||
        (currentPage === 'inbox'
          ? github.errors.authored || github.errors.review || github.errors.issues
          : '')
      : '');
  const latestPull =
    openedPull &&
    [...github.pulls, ...github.inbox, ...github.review, openedPull]
      .filter(
        (record) =>
          record.number === openedPull.number && (!('kind' in record) || record.kind === 'pull'),
      )
      .sort(
        (a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0),
      )[0];
  const latestIssue =
    recordPreview &&
    [...github.inbox, ...github.issues, recordPreview]
      .filter(
        (record) => record.kind === recordPreview.kind && record.number === recordPreview.number,
      )
      .sort(
        (a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0),
      )[0];
  const className = `${light ? 'theme-light' : ''} density-${data.preferences.density} ${data.preferences.reducedMotion ? 'reduced-motion' : ''}`;

  return (
    <I18nContext.Provider value={language}>
      <div
        className={`workspace-root ${className}`}
        style={typographyStyle(data.preferences.typography)}
      >
        <FloatingWarnings>
          {notices.toast && (
            <div className="inbox-toast" role="status">
              <button
                onClick={() => {
                  navigate('inbox');
                  notices.dismiss();
                }}
              >
                {notices.toast}
              </button>
              <button aria-label={t('关闭消息提醒')} onClick={notices.dismiss}>
                ×
              </button>
            </div>
          )}
          {notices.error && (
            <FloatingWarning title={t('通知发送失败')} key={notices.error}>
              <p>{t(notices.error)}</p>
              <button className="chip" onClick={notices.clearError}>
                {t('关闭')}
              </button>
            </FloatingWarning>
          )}
          <WorkspaceShell
            repo={github.repo}
            login={github.session?.user.login}
            avatarUrl={github.session?.user.avatar_url}
            repositoryAvatarUrl={repositoryAvatarUrl}
            counts={{ review: github.review.length, issues: github.issues.length }}
            onChooseRepository={chooseRepository}
            view={view}
            unread={unread}
            notificationsAvailable={Boolean(github.session)}
            onNavigate={navigate}
            loading={busy || !workspace.loaded || updates.status === 'installing'}
            className={className}
            onSearch={() => {
              navigate('authored');
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>('[data-search-pulls]')?.focus(),
              );
            }}
          >
            {(error || workspace.error) && (
              <FloatingWarning title={t('本地数据需要处理')} key={error || workspace.error}>
                {error
                  ? t('本地数据访问失败：{0}', [error])
                  : workspace.errorKind === 'save'
                    ? t('更改尚未保存。请重试保存后再退出。')
                    : t('无法读取本地数据。请重试。')}
                {workspace.error && (
                  <button
                    className="chip"
                    disabled={workspace.saving}
                    onClick={() => void workspace.retry().catch(() => undefined)}
                  >
                    {workspace.saving
                      ? t('正在保存…')
                      : workspace.errorKind === 'save'
                        ? t('重试保存')
                        : t('重试读取')}
                  </button>
                )}
              </FloatingWarning>
            )}
            {updates.status === 'available' && view !== 'settings' && (
              <p className="sync-status" role="status">
                {t('新版本')}
                {updates.nextVersion} {t('可用，可在设置 → 关于与更新下载。')}
              </p>
            )}
            {syncError && (
              <FloatingWarning title={t('暂时无法更新工作区')} key={syncError}>
                <p>{githubErrorMessage(syncError)}</p>
                {currentPage && github.times[currentPage] && (
                  <p>
                    {t('上次读取：')}
                    {new Date(github.times[currentPage]!).toLocaleString(language.locale)}{' '}
                    {t('· 可能不是最新')}
                  </p>
                )}
                <div className="inline-group">
                  <button
                    className="chip accent"
                    disabled={github.syncing}
                    onClick={() => void github.refresh()}
                  >
                    {t('重试同步')}
                  </button>
                  <button
                    className="chip"
                    onClick={() => {
                      navigate('onboarding');
                      void github.connect();
                    }}
                  >
                    {t('重新检查连接')}
                  </button>
                </div>
              </FloatingWarning>
            )}
            {github.session && github.repo && view !== 'settings' && view !== 'profile' && (
              <div className="sync-status" role="status">
                <span>
                  {github.syncing
                    ? t('正在读取 GitHub 数据…')
                    : currentPage && github.times[currentPage]
                      ? t('{0} {1}', [
                          t(openedPull ? '列表同步时间' : '上次读取'),
                          new Date(github.times[currentPage]!).toLocaleTimeString(language.locale),
                        ])
                      : ''}
                </span>
                {currentPage && !openedPull && (
                  <label className="inline-group">
                    {t('更新范围')}
                    <select
                      aria-label={t('更新范围')}
                      value={github.searchDays}
                      onChange={(event) => github.setSearchDays(Number(event.target.value))}
                    >
                      <option value={1}>{t('最近 1 天')}</option>
                      <option value={7}>{t('最近 7 天')}</option>
                      <option value={30}>{t('最近 30 天')}</option>
                      <option value={90}>{t('最近 90 天')}</option>
                      <option value={365}>{t('最近一年')}</option>
                      <option value={0}>{t('全部时间')}</option>
                    </select>
                  </label>
                )}
                <button
                  className="text-button"
                  disabled={github.syncing}
                  onClick={() => void github.refresh()}
                >
                  {t('刷新')}
                </button>
              </div>
            )}
            {currentPage &&
              (github.limited[currentPage] ||
                (currentPage === 'inbox' && Object.values(github.limited).some(Boolean))) && (
                <FloatingWarning title={t('当前范围结果较多')}>
                  <p>
                    {t(
                      '当前范围结果较多，每项查询仅显示最近 200 条，计数为已加载条目。可缩小更新范围查看。',
                    )}
                  </p>
                </FloatingWarning>
              )}
            {updates.status === 'installing' && (
              <p role="status" className="sync-status">
                {t('正在保存数据并安装更新，请勿关闭应用。')}
              </p>
            )}
            <fieldset
              className="workspace-body"
              disabled={!workspace.loaded || updates.status === 'installing'}
            >
              {busy ? (
                <div className="empty-state" role="status">
                  {t('正在打开本地工作区…')}
                </div>
              ) : (
                <>
                  <div className="page-view" hidden={Boolean(openedPull)}>
                    {view === 'profile' && github.session && github.repo ? (
                      <ProfilePage
                        key={github.session.user.id}
                        user={github.session.user}
                        repo={github.repo}
                        gateway={github.gateway}
                        cache={profileCache}
                      />
                    ) : view !== 'settings' &&
                      (!github.session || !github.repo || view === 'onboarding') ? (
                      <GitHubConnection github={github} onChoose={chooseRepository} />
                    ) : currentPage && !github.times[currentPage] ? (
                      <div className="list-empty" role="status">
                        {github.syncing
                          ? t('正在读取 GitHub 数据…')
                          : t('本次读取未成功，请重试。')}
                      </div>
                    ) : view === 'authored' ? (
                      <AuthoredPage
                        key={github.key}
                        pulls={github.pulls}
                        repo={github.repo}
                        onOpen={openPull}
                        read={effectiveRead}
                        onRead={toggleRead}
                      />
                    ) : view === 'settings' ? (
                      <Suspense fallback={<p role="status">{t('正在读取内容…')}</p>}>
                        <SettingsPage
                          updates={updates}
                          flush={async () => {
                            await workspace.flush();
                            await writeQueue.current;
                            if (isDesktop) await saveLastView(view);
                          }}
                          preferences={data.preferences}
                          onChange={changePreferences}
                          onSync={() => void github.refresh()}
                          github={github}
                          onChooseRepository={chooseRepository}
                        />
                      </Suspense>
                    ) : view === 'snoozed' ? (
                      <SnoozedPage
                        data={{
                          ...data,
                          snoozed: Object.fromEntries(
                            Object.entries(data.snoozed).filter(([id]) =>
                              id.startsWith(`github:${github.session?.user.id}:${github.repo}:`),
                            ),
                          ),
                          restored: data.restored.filter((id) =>
                            id.startsWith(`github:${github.session?.user.id}:${github.repo}:`),
                          ),
                        }}
                        records={records}
                        onRestore={(ids) => update((current) => restoreSnoozes(current, ids))}
                        onAdjust={setSnoozeIds}
                        onOpen={openActivity}
                      />
                    ) : (
                      <ActivityPage
                        key={`${github.key}:${view}-${inboxFilter}`}
                        view={view === 'review' || view === 'issues' ? view : 'inbox'}
                        repo={github.repo}
                        items={
                          view === 'review'
                            ? github.review
                            : view === 'issues'
                              ? github.issues
                              : inbox
                        }
                        read={effectiveRead}
                        snoozed={snoozedIds}
                        onRead={toggleRead}
                        onReadAll={(ids) => update((current) => markRecordsRead(current, ids))}
                        onSnooze={(id) => setSnoozeIds([id])}
                        onOpen={openActivity}
                        initialFilter={view === 'inbox' ? inboxFilter : undefined}
                      />
                    )}
                  </div>
                  {openedPull && github.session && (
                    <PullDetailPage
                      key={`${github.key}:${openedPull.number}`}
                      repo={github.repo}
                      accountId={github.session.user.id}
                      gateway={github.gateway}
                      cache={resourceCache}
                      pull={{
                        ...openedPull,
                        updatedAt: latestPull?.updatedAt,
                        headSha: latestPull?.headSha,
                      }}
                      onBack={() => setOpenedPull(null)}
                    />
                  )}
                </>
              )}
            </fieldset>
          </WorkspaceShell>
          {recordPreview && github.session && (
            <IssuePreview
              key={`${github.key}:${recordPreview.number}`}
              cache={resourceCache}
              record={latestIssue ?? recordPreview}
              repo={github.repo}
              accountId={github.session.user.id}
              gateway={github.gateway}
              onClose={() => setRecordPreview(null)}
              onRead={() => toggleRead(recordPreview.id)}
              isRead={effectiveReadIds.has(recordPreview.id)}
              onSnooze={() => {
                setSnoozeIds([recordPreview.id]);
                setRecordPreview(null);
              }}
            />
          )}
          {(github.auth.busy || github.auth.state.status === 'error') && (
            <GitHubLoginDialog github={github} />
          )}
          {repositoryPicker && (
            <RepositoryPicker
              github={github}
              onClose={() => setRepositoryPicker(false)}
              onSelected={() => {
                setRepositoryPicker(false);
                navigate('authored');
              }}
            />
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
                  snoozeRecords: {
                    ...current.snoozeRecords,
                    ...Object.fromEntries(
                      records
                        .filter((record) => snoozeIds.includes(record.id))
                        .map((record) => [
                          record.id,
                          { ...record, summary: record.summary.slice(0, 1000) },
                        ]),
                    ),
                  },
                  restored: current.restored.filter((id) => !snoozeIds.includes(id)),
                }));
                setSnoozeIds(null);
              }}
            />
          )}
        </FloatingWarnings>
      </div>
    </I18nContext.Provider>
  );
}
