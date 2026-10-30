// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useGitHub } from './useGitHub';
import { legacyActivityRevisionIds, previousActivityRevisionIds } from '../core/activity-revision';
import { activityFromGitHub } from '../core/github';
import { defaultWorkspace, inboxReadIds, type WorkspaceData } from '../core/workspace';
import { useInboxNotifications } from './useInboxNotifications';
import { useWorkspace } from './useWorkspace';
import { createGateway, record, repo, response, user } from '../test/github.fixture';
afterEach(cleanup);

it('keeps an upgraded inbox read after restarting into fresh cached data without a live request', async () => {
  const gateway = createGateway();
  const readCache = gateway.request;
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof readCache>) => ({
    ...(await readCache(...args)),
    fetchedAt: Date.now(),
  }));
  gateway.request = vi.fn().mockRejectedValue(new Error('live request should not be needed'));
  const previous = previousActivityRevisionIds(record, user.id, repo).at(-1)!;
  const current = activityFromGitHub(record, user.id, repo, user.login);
  const key = `${user.id}:${repo}`;
  let saved: WorkspaceData = {
    ...defaultWorkspace(),
    read: [previous],
    inboxSeen: { [key]: [previous] },
  };
  const repository = {
    load: async () => JSON.parse(JSON.stringify(saved)),
    save: vi.fn(async (data: WorkspaceData) => {
      saved = JSON.parse(JSON.stringify(data));
    }),
  };
  const mount = () =>
    renderHook(() => {
      const github = useGitHub(5, gateway);
      const workspace = useWorkspace(repository);
      const notices = useInboxNotifications(github, github.inbox, workspace);
      return { github, workspace, notices };
    });
  const hook = mount();
  await waitFor(() => expect(hook.result.current.workspace.data.read).toContain(current.id));
  expect(hook.result.current.github.liveReady).toBe(false);
  expect(hook.result.current.notices.toast).toBe('');
  expect(
    inboxReadIds(hook.result.current.github.inbox, saved.read, saved.unread).has(current.id),
  ).toBe(true);
  await waitFor(() => expect(saved.read).toEqual([current.id]));
  expect(saved.inboxSeen[key]).toEqual([current.id]);
  expect(gateway.request).not.toHaveBeenCalled();
  hook.unmount();
  const reopened = mount();
  await waitFor(() => expect(reopened.result.current.github.inbox.length).toBeGreaterThan(0));
  expect(reopened.result.current.workspace.data.read).toEqual([current.id]);
  expect(reopened.result.current.notices.toast).toBe('');
  expect(gateway.request).not.toHaveBeenCalled();
});
describe('GitHub synchronization', () => {
  it('publishes completed pages while a slow page is pending and coalesces refreshes', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    let finish!: (value: unknown) => void;
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'review'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(result.current.syncing).toBe(true);
    expect(result.current.times.authored).toBeDefined();
    expect(result.current.times.review).toBeUndefined();
    const calls = vi.mocked(gateway.request).mock.calls.length;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
      void result.current.refresh();
    });
    expect(gateway.request).toHaveBeenCalledTimes(calls);
    await act(async () => {
      finish(response([{ data: { search: { issueCount: 0, nodes: [] } } }]));
      await pending;
    });
    expect(result.current.syncing).toBe(false);
    expect(result.current.times.review).toBeDefined();
  });
  it('clears early page results and ignores pending pages after authentication is lost', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    let fail!: (reason: string) => void;
    let finish!: (value: unknown) => void;
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'review'
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : operation === 'issues'
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(async () => {
      fail('GH_ACCOUNT_CHANGED');
    });
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    await act(async () => {
      finish(response([]));
    });
    expect(result.current.issues).toEqual([]);
    expect(result.current.times.issues).toBeUndefined();
  });
  it('restores a remembered session on remount and stays signed out after logout', async () => {
    const gateway = createGateway();
    let signedIn = true;
    vi.mocked(gateway.session).mockImplementation(async () => {
      if (!signedIn) throw 'GH_AUTH_REQUIRED';
      return { user, selected: repo, notificationsAvailable: true };
    });
    vi.mocked(gateway.logout).mockImplementation(async () => {
      signedIn = false;
    });
    const first = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(first.result.current.pulls).toHaveLength(2));
    first.unmount();
    const restored = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(restored.result.current.pulls).toHaveLength(2));
    expect(restored.result.current.session?.user.id).toBe(user.id);
    expect(restored.result.current.repo).toBe(repo);
    expect(gateway.login).not.toHaveBeenCalled();
    await act(() => restored.result.current.disconnect());
    expect(restored.result.current.session).toBeNull();
    expect(restored.result.current.pulls).toEqual([]);
    expect(restored.result.current.repo).toBe('');
    restored.unmount();
    const signedOut = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(signedOut.result.current.connecting).toBe(false));
    expect(signedOut.result.current.session).toBeNull();
    expect(signedOut.result.current.pulls).toEqual([]);
  });
  it('keeps the loaded workspace when confirming the same repository after login', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(() => result.current.selectRepository(repo));
    expect(result.current.repo).toBe(repo);
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.times.authored).toBeDefined();
  });
  it('loads a unified activity feed without the unsupported GitHub notifications API', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockResolvedValue({
      user,
      selected: repo,
      notificationsAvailable: false,
    });
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(vi.mocked(gateway.request).mock.calls.some(([operation]) => operation === 'inbox')).toBe(
      false,
    );
    expect(result.current.errors.inbox).toBeUndefined();
    expect(result.current.times.inbox).toBeDefined();
    expect(result.current.inbox).toHaveLength(4);
  });
  it('merges successful authored, review, and issue reads even when the inbox search is empty', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'activity'
        ? Promise.resolve(response([{ data: { search: { issueCount: 0, nodes: [] } } }]))
        : operation === 'issues'
          ? Promise.resolve(
              response([
                {
                  data: {
                    search: {
                      issueCount: 1,
                      nodes: [
                        {
                          ...record,
                          __typename: 'Issue',
                          number: 77,
                          url: `https://github.com/${repo}/issues/77`,
                        },
                      ],
                    },
                  },
                },
              ]),
            )
          : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    await waitFor(() => expect(result.current.inbox).toHaveLength(3));
    expect(
      result.current.inbox.filter((item) => item.kind === 'issue').map((item) => item.number),
    ).toEqual([77]);
    expect(
      result.current.inbox.filter((item) => item.kind === 'pull').map((item) => item.number),
    ).toEqual([1042, 1031]);
  });
  it('clears account records when disconnecting only the independent app', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(() => result.current.disconnect());
    expect(gateway.logout).toHaveBeenCalledOnce();
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    expect(result.current.repo).toBe('');
  });
  it('keeps logout failures visible instead of claiming the credential was cleared', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.logout).mockRejectedValue('GH_SECURE_STORAGE');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(() => result.current.disconnect());
    expect(result.current.session?.user.id).toBe(user.id);
    expect(result.current.connectionError).toBe('GH_SECURE_STORAGE');
  });
  it('clears every repository page when activity access is forbidden', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi
      .fn()
      .mockImplementation((operation, repository, accountId, number) =>
        operation === 'activity'
          ? Promise.reject('GH_FORBIDDEN')
          : request(operation, repository, accountId, number),
      );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.errors.inbox).toBe('GH_FORBIDDEN'));
    expect(result.current.pulls).toEqual([]);
    expect(result.current.errors.inbox).toBe('GH_FORBIDDEN');
    expect(result.current.inbox).toEqual([]);
    expect(result.current.errors.authored).toBe('GH_FORBIDDEN');
  });
  it('discards late data from the previous repository', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    let finish: (value: unknown) => void = () => {};
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'authored' && repository === repo
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : request(operation, repository, accountId, number),
    );
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(gateway.request).toHaveBeenCalledWith('authored', repo, user.id));
    await act(() => result.current.selectRepository('owner/other'));
    await waitFor(() => expect(result.current.key).toBe('7:owner/other'));
    await act(async () =>
      finish(
        response([
          {
            data: {
              search: { issueCount: 1, nodes: [{ ...record, title: 'Old repository result' }] },
            },
          },
        ]),
      ),
    );
    expect(result.current.repo).toBe('owner/other');
    expect(result.current.pulls.some((p) => p.title === 'Old repository result')).toBe(false);
  });
  it('preserves the selected repository if access validation fails', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.select).mockRejectedValue('GH_FORBIDDEN');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    await act(async () => {
      await expect(result.current.selectRepository('private/denied')).rejects.toBe('GH_FORBIDDEN');
    });
    expect(result.current.repo).toBe(repo);
    expect(result.current.repositoryError).toBe('GH_FORBIDDEN');
  });
  it('clears account data if the authorized account changes during synchronization', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    vi.mocked(gateway.request).mockRejectedValue('GH_ACCOUNT_CHANGED');
    await act(() => result.current.refresh());
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    expect(result.current.connectionError).toBe('GH_ACCOUNT_CHANGED');
  });
  it('retains records with an explicit stale warning and timestamp on network failure', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    const fetchedAt = result.current.times.authored;
    vi.mocked(gateway.request).mockRejectedValue('GH_REQUEST_FAILED');
    await act(() => result.current.refresh());
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.times.authored).toBe(fetchedAt);
    expect(result.current.errors.authored).toBe('GH_REQUEST_FAILED');
  });
  it('replaces stale records and clears errors after a successful refresh', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    const fetchedAt = result.current.times.authored!;
    vi.mocked(gateway.request).mockRejectedValue('GH_REQUEST_FAILED');
    await act(() => result.current.refresh());
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.times.authored).toBe(fetchedAt);
    expect(result.current.errors.authored).toBe('GH_REQUEST_FAILED');
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'authored'
        ? Promise.resolve({
            ...response([
              { data: { search: { issueCount: 1, nodes: [{ ...record, title: 'Recovered' }] } } },
            ]),
            fetchedAt: fetchedAt + 1000,
          })
        : request(operation, repository, accountId, number),
    );
    await act(() => result.current.refresh());
    expect(result.current.pulls.map((pull) => pull.title)).toEqual(['Recovered']);
    expect(result.current.times.authored).toBe(fetchedAt + 1000);
    expect(result.current.errors.authored).toBeUndefined();
  });
  it('ignores a late refresh after reconnecting', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    let fail: (reason: string) => void = () => {};
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'authored'
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : request(operation, repository, accountId, number),
    );
    let pending: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    gateway.request = request;
    await act(() => result.current.connect());
    await act(async () => {
      fail('GH_AUTH_REQUIRED');
      await pending;
    });
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.session?.user.id).toBe(user.id);
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.connectionError).toBe('');
  });
  it('retains the current workspace when rechecking the connection fails temporarily', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    vi.mocked(gateway.session).mockRejectedValueOnce('GH_REQUEST_FAILED');
    await act(() => result.current.connect());
    expect(result.current.session?.user.id).toBe(user.id);
    expect(result.current.repo).toBe(repo);
    expect(result.current.pulls).toHaveLength(2);
    expect(result.current.connectionError).toBe('GH_REQUEST_FAILED');
    await act(() => result.current.connect());
    await waitFor(() => expect(result.current.connectionError).toBe(''));
  });
  it.each([
    'GH_AUTH_REQUIRED',
    'GH_AUTH_REQUIRED: 请使用 ThreadLine 独立授权登录 GitHub。',
    new Error('GH_AUTH_REQUIRED: 请使用 ThreadLine 独立授权登录 GitHub。'),
  ])('does not warn for an expected initial missing credential: %s', async (error) => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValue(error);
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.connectionError).toBe('');
    expect(result.current.session).toBeNull();
  });
  it.each([
    'GH_AUTH_REQUIRED: 凭据与 ThreadLine 独立应用不匹配，请重新登录。',
    'GH_AUTH_REQUIRED: 登录存储已升级，请重新登录一次以启用软件管理的本机凭据。',
  ])('keeps initial credential problems actionable: %s', async (error) => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValue(error);
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.connectionError).toBe(error);
  });
  it('reports expiration when a previously cached login can no longer authenticate', async () => {
    const gateway = createGateway();
    gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
    vi.mocked(gateway.session).mockRejectedValue('GH_AUTH_REQUIRED');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.connectionError).toBe('GH_AUTH_REQUIRED');
  });
  it('keeps explicit expired-credential errors actionable even without cached session data', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValue('GH_AUTH_REQUIRED: 授权已过期');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.connectionError).toContain('GH_AUTH_REQUIRED');
  });
  it('clears the workspace when rechecking reveals lost authentication', async () => {
    const gateway = createGateway();
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    vi.mocked(gateway.session).mockRejectedValueOnce('GH_AUTH_REQUIRED');
    await act(() => result.current.connect());
    expect(result.current.session).toBeNull();
    expect(result.current.pulls).toEqual([]);
    expect(result.current.connectionError).toBe('GH_AUTH_REQUIRED');
  });
  it('treats an initial missing login as normal and allows connecting afterward', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValueOnce('GH_AUTH_REQUIRED');
    const { result } = renderHook(() => useGitHub(0, gateway));
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.connectionError).toBe('');
    expect(result.current.session).toBeNull();
    await act(() => result.current.connect());
    await waitFor(() => expect(result.current.pulls).toHaveLength(2));
    expect(result.current.connectionError).toBe('');
  });
});

it('offers exact legacy aliases from the selected repository and discards them when switching scopes', async () => {
  const gateway = createGateway();
  const { result } = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(result.current.times.issues).toBeDefined());
  const previous = legacyActivityRevisionIds(record, user.id, repo)[0];
  const aliases = result.current.legacyAliases([previous], result.current.inbox);
  expect(aliases.get(previous)?.number).toBe(record.number);
  expect(aliases.get(previous)?.id).toContain(`:activity:pull-${record.number}-v4-`);
  await act(() => result.current.selectRepository('owner/other'));
  await waitFor(() => expect(result.current.times.issues).toBeDefined());
  expect(result.current.legacyAliases([previous], result.current.inbox).size).toBe(0);
});

it('releases only its captured raw snapshot without changing the inbox or refreshing the network', async () => {
  const gateway = createGateway();
  const { result } = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(result.current.times.issues).toBeDefined());
  const previous = legacyActivityRevisionIds(record, user.id, repo)[0];
  const initialInbox = result.current.inbox;
  const releaseFirst = result.current.releaseMigrationSources;
  const calls = vi.mocked(gateway.request).mock.calls.length;
  expect('sources' in result.current).toBe(false);
  expect(result.current.legacyAliases([previous], initialInbox).size).toBe(1);
  act(() => releaseFirst());
  expect(result.current.legacyAliases([previous], initialInbox).size).toBe(0);
  expect(result.current.inbox).toBe(initialInbox);
  expect(gateway.request).toHaveBeenCalledTimes(calls);

  await act(() => result.current.refresh());
  const nextInbox = result.current.inbox;
  expect(result.current.legacyAliases([previous], nextInbox).size).toBe(1);
  act(() => releaseFirst());
  expect(result.current.legacyAliases([previous], nextInbox).size).toBe(1);
  expect(result.current.inbox).toBe(nextInbox);
  const releaseSecond = result.current.releaseMigrationSources;
  await act(() => result.current.refresh());
  act(() => releaseSecond());
  expect(result.current.legacyAliases([previous], result.current.inbox).size).toBe(1);
  const lastInbox = result.current.inbox;
  act(() => result.current.releaseMigrationSources());
  expect(result.current.legacyAliases([previous], lastInbox).size).toBe(0);
  expect(result.current.inbox).toBe(lastInbox);
  expect(gateway.request).toHaveBeenCalledTimes(calls + 8);
});

it('opens a cached session and fresh lists while live authentication is pending without duplicate fetches', async () => {
  const gateway = createGateway();
  const live = gateway.request;
  gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof live>) => ({
    ...(await live(...args)),
    fetchedAt: Date.now(),
  }));
  gateway.request = vi.fn().mockImplementation(live);
  let finish!: (session: { user: typeof user; selected: string }) => void;
  gateway.session = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useGitHub(5, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  expect(result.current.connecting).toBe(true);
  expect(result.current.liveReady).toBe(false);
  expect(gateway.request).not.toHaveBeenCalled();
  await act(async () => finish({ user, selected: repo }));
  await waitFor(() => expect(result.current.connecting).toBe(false));
  expect(gateway.cached).toHaveBeenCalledTimes(4);
  expect(gateway.request).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.refresh();
  });
  expect(gateway.request).toHaveBeenCalledTimes(4);
  expect(result.current.liveReady).toBe(true);
});

it('publishes stale cached lists before network completion and only marks a complete live refresh ready', async () => {
  const gateway = createGateway();
  const live = gateway.request;
  gateway.cached = vi.fn().mockImplementation(live);
  const finishes: Array<(value: unknown) => void> = [];
  gateway.request = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finishes.push(resolve);
      }),
  );
  const { result } = renderHook(() => useGitHub(5, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  expect(result.current.syncing).toBe(true);
  expect(result.current.liveReady).toBe(false);
  await waitFor(() => expect(finishes).toHaveLength(4));
  await act(async () => {
    finishes.forEach((finish, index) => finish({ ...response([]), stale: index === 0 }));
  });
  expect(result.current.syncing).toBe(false);
  expect(result.current.liveReady).toBe(false);
});

it('queues a forced refresh requested during cache hydration', async () => {
  const gateway = createGateway();
  const live = gateway.request;
  gateway.request = vi.fn().mockImplementation(live);
  let finish!: (value: unknown) => void;
  gateway.cached = vi.fn().mockImplementation((operation) =>
    operation === 'review'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : live(operation, repo, user.id).then((value) => ({ ...value, fetchedAt: Date.now() })),
  );
  const { result } = renderHook(() => useGitHub(5, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  let forced!: Promise<void>;
  act(() => {
    forced = result.current.refresh();
  });
  await act(async () => {
    finish({ ...response([]), fetchedAt: Date.now() });
    await forced;
  });
  expect(gateway.request).toHaveBeenCalledTimes(4);
  expect(result.current.liveReady).toBe(true);
});

it('clears cached identity and records if background session validation denies application permissions', async () => {
  const gateway = createGateway();
  const live = gateway.request;
  gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
  gateway.cached = vi.fn().mockImplementation(live);
  let reject!: (reason: string) => void;
  gateway.session = vi.fn().mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { result } = renderHook(() => useGitHub(5, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  await act(async () => reject('GH_APP_PERMISSIONS_UNSAFE'));
  expect(result.current.session).toBeNull();
  expect(result.current.pulls).toEqual([]);
});

it('preserves repository selection made while cached-session validation is pending', async () => {
  const gateway = createGateway();
  gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
  let finish!: (value: { user: typeof user; selected: string }) => void;
  gateway.session = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(result.current.repo).toBe(repo));
  await act(async () => {
    await result.current.selectRepository('owner/other');
  });
  await act(async () => finish({ user, selected: repo }));
  expect(result.current.repo).toBe('owner/other');
  expect(result.current.connecting).toBe(false);
});

it('clears all cached repository pages when any page denies repository access', async () => {
  const gateway = createGateway();
  const original = gateway.request;
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof original>) => ({
    ...(await original(...args)),
    fetchedAt: Date.now(),
  }));
  gateway.request = vi.fn().mockImplementation(original);
  const { result } = renderHook(() => useGitHub(5, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  gateway.request = vi.fn().mockImplementation(async (operation) => {
    if (operation === 'review') throw new Error('GH_FORBIDDEN');
    return original(operation, repo, user.id);
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.pulls).toEqual([]);
  expect(result.current.inbox).toEqual([]);
  expect(result.current.review).toEqual([]);
  expect(result.current.issues).toEqual([]);
  expect(result.current.liveReady).toBe(false);
});

it('clears an offline cached-session connection error after a complete successful manual refresh', async () => {
  const gateway = createGateway();
  const original = gateway.request;
  gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof original>) => ({
    ...(await original(...args)),
    fetchedAt: Date.now(),
  }));
  gateway.session = vi.fn().mockRejectedValue('GH_TIMEOUT');
  const { result } = renderHook(() => useGitHub(5, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  expect(result.current.connectionError).toBe('GH_TIMEOUT');
  expect(result.current.session?.user.id).toBe(user.id);
  expect(result.current.liveReady).toBe(false);
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.liveReady).toBe(true);
  expect(result.current.connectionError).toBe('');
});

it('recovers cached lists on reconnect without periodic polling or duplicate refreshes', async () => {
  const gateway = createGateway();
  const request = gateway.request;
  gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof request>) => ({
    ...(await request(...args)),
    fetchedAt: Date.now(),
  }));
  gateway.session = vi.fn().mockRejectedValue('GH_TIMEOUT');
  gateway.request = vi.fn().mockRejectedValue('GH_REQUEST_FAILED');
  const { result } = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  await waitFor(() => expect(result.current.syncing).toBe(false));
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(result.current.errors.authored).toBe('GH_REQUEST_FAILED'));
  expect(result.current.pulls).toHaveLength(2);
  expect(result.current.session?.user.id).toBe(user.id);
  vi.mocked(gateway.request).mockImplementation(request);
  act(() => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
  });
  await waitFor(() => expect(result.current.liveReady).toBe(true));
  expect(gateway.request).toHaveBeenCalledTimes(8);
  expect(result.current.connectionError).toBe('');
});

it('retries a failed startup session on reconnect but does not retry revoked authorization', async () => {
  const gateway = createGateway();
  gateway.session = vi
    .fn()
    .mockRejectedValueOnce('GH_TIMEOUT')
    .mockResolvedValue({ user, selected: repo });
  const { result, unmount } = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(result.current.connectionError).toBe('GH_TIMEOUT'));
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  expect(gateway.session).toHaveBeenCalledTimes(2);
  unmount();
  gateway.session = vi.fn().mockRejectedValue('GH_AUTH_REQUIRED');
  const signedOut = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(signedOut.result.current.connecting).toBe(false));
  act(() => window.dispatchEvent(new Event('online')));
  expect(gateway.session).toHaveBeenCalledTimes(1);
});

it('reconnects after an older in-flight batch fails without duplicating online-event retries', async () => {
  const gateway = createGateway();
  const request = gateway.request;
  let fail!: (reason: string) => void;
  gateway.request = vi.fn().mockImplementation((...args: Parameters<typeof request>) => {
    if (args[0] === 'authored' && !fail)
      return new Promise((_, reject) => {
        fail = reject;
      });
    return request(...args);
  });
  const { result } = renderHook(() => useGitHub(0, gateway));
  await waitFor(() => expect(fail).toBeDefined());
  act(() => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
  });
  await act(async () => fail('GH_REQUEST_FAILED'));
  await waitFor(() => expect(result.current.liveReady).toBe(true));
  expect(result.current.pulls).toHaveLength(2);
  expect(gateway.request).toHaveBeenCalledTimes(8);
});

it('isolates search ranges and ignores a delayed response from the previous range', async () => {
  const gateway = createGateway();
  const original = gateway.request;
  let finish!: (value: unknown) => void;
  gateway.request = vi
    .fn()
    .mockImplementation((operation, repository, accountId, number, head, days) => {
      if (operation === 'authored' && days === 30)
        return new Promise((resolve) => {
          finish = resolve;
        });
      return original(operation, repository, accountId, number, head, days);
    });
  const { result } = renderHook(() => useGitHub(0, gateway, 30));
  await waitFor(() => expect(finish).toBeDefined());
  act(() => result.current.setSearchDays(7));
  await waitFor(() => expect(result.current.pulls).toHaveLength(2));
  await act(async () =>
    finish(
      response([
        { data: { search: { issueCount: 1, nodes: [{ ...record, title: 'stale scope' }] } } },
      ]),
    ),
  );
  expect(result.current.pulls[0].title).not.toBe('stale scope');
  expect(gateway.request).toHaveBeenCalledWith('authored', repo, user.id, 0, '', 7);
});

it('exposes bounded search results without treating them as an error or a complete count', async () => {
  const gateway = createGateway();
  gateway.request = vi
    .fn()
    .mockResolvedValue(
      response([{ data: { search: { issueCount: 5000, nodes: [record], truncated: true } } }]),
    );
  const { result } = renderHook(() => useGitHub(0, gateway, 30));
  await waitFor(() => expect(result.current.pulls).toHaveLength(1));
  expect(result.current.limited.authored).toBe(true);
  expect(result.current.errors.authored).toBeUndefined();
});
