// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityFromGitHub } from '../core/github';
import { legacyActivityRevisionIds } from '../core/activity-revision';
import { findLegacyActivityAliases } from '../core/migrate-activity-state';
import type { Activity } from '../features/activity/model';
import { defaultWorkspace, MAX_INBOX_REVISIONS, type WorkspaceData } from '../core/workspace';
import { record, repo, user } from '../test/github.fixture';
import type { GitHubWorkspace } from './useGitHub';
import { useInboxNotifications } from './useInboxNotifications';
import { useWorkspace } from './useWorkspace';
import { notifyDesktop } from './notifications';
import { playNotificationSound } from './notification-sound';
vi.mock('./notification-sound', () => ({
  playNotificationSound: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./notifications', () => ({ notifyDesktop: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./desktop', () => ({ isDesktop: false }));

const key = `${user.id}:${repo}`;
const activity = activityFromGitHub(record, user.id, repo, user.login);

const records = Array.from({ length: MAX_INBOX_REVISIONS }, (_, index) => ({
  ...activity,
  number: index + 1,
  id: `github:${user.id}:${repo}:pull:${index + 1}:2026-10-29T12:00:00Z`,
}));
const github = {
  key,
  repo,
  syncing: false,
  times: { inbox: 1, authored: 1, review: 1, issues: 1 },
  errors: {},
  releaseMigrationSources: () => {},
} as GitHubWorkspace;
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
beforeEach(() => {
  vi.mocked(playNotificationSound).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('inbox notifications', () => {
  it('keeps in-app updates without attempting native delivery in a browser', async () => {
    vi.mocked(notifyDesktop).mockClear();
    const saved = defaultWorkspace();
    saved.preferences.desktopNotifications = true;
    saved.inboxSeen[key] = [activity.id];
    const repository = { load: async () => saved, save: vi.fn().mockResolvedValue(undefined) };
    const changed = { ...activity, id: `${activity.id}:new` };
    const { result } = renderHook(() => {
      const workspace = useWorkspace(repository);
      return useInboxNotifications(github, [changed], workspace);
    });
    await flush();
    await flush();
    expect(result.current.toast).toContain('有新动态');
    expect(result.current.error).toBe('');
    expect(notifyDesktop).not.toHaveBeenCalled();
  });
  it('keeps the full supported baseline and read state across refreshes and persistence', async () => {
    let saved: WorkspaceData = { ...defaultWorkspace(), read: [records[0].id] };
    const repository = {
      load: async () => JSON.parse(JSON.stringify(saved)),
      save: vi.fn(async (data: WorkspaceData) => {
        saved = JSON.parse(JSON.stringify(data));
      }),
    };
    const mount = () =>
      renderHook(
        ({ source, items }) => {
          const workspace = useWorkspace(repository);
          const notices = useInboxNotifications(source, items, workspace);
          return { workspace, notices };
        },
        { initialProps: { source: github, items: records } },
      );
    const first = mount();
    await flush();
    await flush();
    expect(saved.inboxSeen[key]).toHaveLength(MAX_INBOX_REVISIONS);
    expect(first.result.current.notices.toast).toBe('');
    const writes = repository.save.mock.calls.length;
    first.rerender({ source: { ...github, times: { ...github.times, inbox: 2 } }, items: records });
    await flush();
    expect(repository.save).toHaveBeenCalledTimes(writes);
    expect(first.result.current.workspace.data.read).toContain(records[0].id);
    expect(first.result.current.notices.toast).toBe('');
    first.unmount();
    const restored = mount();
    await flush();
    await flush();
    expect(restored.result.current.workspace.data.inboxSeen[key]).toHaveLength(MAX_INBOX_REVISIONS);
    expect(restored.result.current.workspace.data.read).toContain(records[0].id);
    expect(restored.result.current.notices.toast).toBe('');
    const changed = { ...records[0], id: records[0].id.replace('12:00:00', '13:00:00') };
    act(() =>
      restored.result.current.workspace.update((data) => ({ ...data, read: [changed.id] })),
    );
    restored.rerender({
      source: { ...github, times: { ...github.times, inbox: 3 } },
      items: [changed, ...records.slice(1)],
    });
    await flush();
    expect(restored.result.current.workspace.data.read).toEqual([]);
    expect(restored.result.current.notices.toast).toContain('有新动态');
    expect(saved.inboxSeen[key]).toContain(changed.id);
  });

  it('waits for authored recovery before establishing a complete baseline', async () => {
    const repository = { load: async () => defaultWorkspace(), save: vi.fn(async () => {}) };
    const hook = renderHook(
      ({ source, items }) => {
        const workspace = useWorkspace(repository);
        return { workspace, notices: useInboxNotifications(source, items, workspace) };
      },
      {
        initialProps: {
          source: { ...github, errors: { authored: 'Unavailable' } } as GitHubWorkspace,
          items: records.slice(0, 1),
        },
      },
    );
    await flush();
    await flush();
    expect(hook.result.current.workspace.data.inboxSeen[key]).toBeUndefined();
    hook.rerender({ source: github, items: records });
    await flush();
    expect(hook.result.current.workspace.data.inboxSeen[key]).toHaveLength(MAX_INBOX_REVISIONS);
    expect(hook.result.current.notices.toast).toBe('');
  });

  it('does not consume or replace a baseline when the supported inbox bound is exceeded', async () => {
    const data = {
      ...defaultWorkspace(),
      inboxSeen: { [key]: records.map((item) => item.id) },
      read: [records[0].id],
    };
    const repository = { load: async () => data, save: vi.fn(async () => {}) };
    const hook = renderHook(() => {
      const workspace = useWorkspace(repository);
      return {
        workspace,
        notices: useInboxNotifications(
          github,
          [...records, { ...records[0], id: 'inbox-9999' }],
          workspace,
        ),
      };
    });
    await flush();
    await flush();
    expect(repository.save).not.toHaveBeenCalled();
    expect(hook.result.current.workspace.data.read).toEqual(data.read);
    expect(hook.result.current.notices.toast).toBe('');
  });
});

it('silently rebuilds a version 2 checkpoint while retaining local workspace choices', async () => {
  const original = {
    ...defaultWorkspace(),
    inboxVersion: 2,
    inboxSeen: { [key]: ['inbox-1042'] },
    preferences: { ...defaultWorkspace().preferences, theme: 'light' },
    read: ['inbox-1042'],
    snoozed: { 'inbox-1042': Date.now() + 60000 },
    snoozeRecords: { 'inbox-1042': { ...activity, id: 'inbox-1042' } },
  };
  const repository = {
    load: async () => JSON.parse(JSON.stringify(original)),
    save: vi.fn(async () => {}),
  };
  const hook = renderHook(() => {
    const workspace = useWorkspace(repository);
    return { workspace, notices: useInboxNotifications(github, [activity], workspace) };
  });
  await flush();
  await flush();
  expect(hook.result.current.notices.toast).toBe('');
  expect(hook.result.current.workspace.data.inboxVersion).toBe(3);
  expect(hook.result.current.workspace.data.inboxSeen[key]).toEqual([activity.id]);
  expect(hook.result.current.workspace.data.read).toEqual(original.read);
  expect(hook.result.current.workspace.data.snoozed).toEqual(original.snoozed);
  expect(hook.result.current.workspace.data.snoozeRecords).toEqual(original.snoozeRecords);
  expect(hook.result.current.workspace.data.preferences).toEqual(original.preferences);
});

it('atomically migrates exact legacy state and the checkpoint without repeating work after restart', async () => {
  const previous = legacyActivityRevisionIds(record, user.id, repo)[0];
  const until = Date.now() + 60000;
  let saved: unknown = {
    ...defaultWorkspace(),
    inboxVersion: 2,
    inboxSeen: { [key]: [previous] },
    read: [previous],
    snoozed: { [previous]: until },
    snoozeRecords: { [previous]: { ...activity, id: previous } },
  };
  const repository = {
    load: async () => JSON.parse(JSON.stringify(saved)),
    save: vi.fn(async (data: WorkspaceData) => {
      saved = JSON.parse(JSON.stringify(data));
    }),
  };
  const source = {
    ...github,
    legacyAliases: vi.fn((ids: readonly string[], targets: readonly Activity[]) =>
      findLegacyActivityAliases([record], targets, ids, user.id, repo),
    ),
  };
  const mount = () =>
    renderHook(() => {
      const workspace = useWorkspace(repository);
      return { workspace, notices: useInboxNotifications(source, [activity], workspace) };
    });
  const first = mount();
  await flush();
  await flush();
  expect(first.result.current.workspace.data.read).toEqual([activity.id]);
  expect(first.result.current.workspace.data.snoozed).toEqual({ [activity.id]: until });
  expect(first.result.current.workspace.data.snoozeRecords).toEqual({ [activity.id]: activity });
  expect(first.result.current.workspace.data.inboxSeen[key]).toEqual([activity.id]);
  expect(first.result.current.notices.toast).toBe('');
  expect(source.legacyAliases).toHaveBeenCalledTimes(1);
  first.unmount();
  const restarted = mount();
  await flush();
  await flush();
  expect(restarted.result.current.workspace.data.read).toEqual([activity.id]);
  expect(restarted.result.current.workspace.data.snoozed).toEqual({ [activity.id]: until });
  expect(restarted.result.current.notices.toast).toBe('');
  expect(source.legacyAliases).toHaveBeenCalledTimes(1);
});

it('migrates an absent saved snooze when identical content later returns without announcing it', async () => {
  const previous = legacyActivityRevisionIds(record, user.id, repo)[0];
  const until = Date.now() + 60000;
  const original = {
    ...defaultWorkspace(),
    inboxVersion: 2,
    read: [previous],
    snoozed: { [previous]: until },
    snoozeRecords: { [previous]: { ...activity, id: previous } },
  };
  const repository = { load: async () => original, save: vi.fn(async () => {}) };
  const source = {
    ...github,
    legacyAliases: vi.fn((ids: readonly string[], targets: readonly Activity[]) =>
      findLegacyActivityAliases([record], targets, ids, user.id, repo),
    ),
  };
  const hook = renderHook(
    ({ items, time }) => {
      const workspace = useWorkspace(repository);
      return {
        workspace,
        notices: useInboxNotifications(
          { ...source, times: { ...source.times, inbox: time } },
          items,
          workspace,
        ),
      };
    },
    { initialProps: { items: [] as Activity[], time: 1 } },
  );
  await flush();
  await flush();
  expect(hook.result.current.workspace.data.inboxSeen[key]).toEqual([]);
  expect(hook.result.current.workspace.data.snoozed).toEqual({ [previous]: until });
  hook.rerender({ items: [activity], time: 2 });
  await flush();
  await flush();
  expect(hook.result.current.workspace.data.read).toEqual([activity.id]);
  expect(hook.result.current.workspace.data.snoozed).toEqual({ [activity.id]: until });
  expect(hook.result.current.workspace.data.snoozeRecords).toEqual({ [activity.id]: activity });
  expect(hook.result.current.notices.toast).toBe('');
  const calls = source.legacyAliases.mock.calls.length;
  hook.rerender({ items: [activity], time: 3 });
  await flush();
  expect(source.legacyAliases).toHaveBeenCalledTimes(calls);
});

it.each(['HEAD', 'comment'])(
  'does not inherit legacy read or snooze state after a real %s change',
  async (field) => {
    const previous = legacyActivityRevisionIds(record, user.id, repo)[0];
    const changed =
      field === 'HEAD'
        ? { ...record, headRefOid: 'b'.repeat(40) }
        : {
            ...record,
            comments: {
              ...record.comments,
              nodes: [{ ...record.comments.nodes[0], body: 'edited' }],
            },
          };
    const next = activityFromGitHub(changed, user.id, repo, user.login);
    const until = Date.now() + 60000;
    const repository = {
      load: async () => ({
        ...defaultWorkspace(),
        inboxSeen: { [key]: [] },
        read: [previous],
        snoozed: { [previous]: until },
        snoozeRecords: { [previous]: { ...activity, id: previous } },
      }),
      save: vi.fn(async () => {}),
    };
    const source = {
      ...github,
      legacyAliases: vi.fn((ids: readonly string[], targets: readonly Activity[]) =>
        findLegacyActivityAliases([record, changed], targets, ids, user.id, repo),
      ),
    };
    const hook = renderHook(
      ({ items }) => {
        const workspace = useWorkspace(repository);
        return { workspace, notices: useInboxNotifications(source, items, workspace) };
      },
      { initialProps: { items: [] as Activity[] } },
    );
    await flush();
    await flush();
    hook.rerender({ items: [next] });
    await flush();
    expect(hook.result.current.workspace.data.read).toEqual([previous]);
    expect(hook.result.current.workspace.data.snoozed).toEqual({ [previous]: until });
    expect(hook.result.current.notices.toast).toBe('PR #1042 有新动态');
    expect(hook.result.current.workspace.data.inboxSeen[key]).toEqual([next.id]);
    const calls = source.legacyAliases.mock.calls.length;
    hook.rerender({ items: [next] });
    await flush();
    expect(source.legacyAliases).toHaveBeenCalledTimes(calls);
  },
);

it('releases migration sources after successful decisions including unchanged revisions and no legacy state', async () => {
  const releaseMigrationSources = vi.fn();
  const legacyAliases = vi.fn();
  const source = { ...github, releaseMigrationSources, legacyAliases };
  const repository = { load: async () => defaultWorkspace(), save: vi.fn(async () => {}) };
  const hook = renderHook(
    ({ source }) => {
      const workspace = useWorkspace(repository);
      return useInboxNotifications(source, [activity], workspace);
    },
    {
      initialProps: {
        source: { ...source, errors: { authored: 'Unavailable' } } as GitHubWorkspace,
      },
    },
  );
  await flush();
  await flush();
  expect(releaseMigrationSources).not.toHaveBeenCalled();
  hook.rerender({ source });
  await flush();
  await flush();
  expect(releaseMigrationSources).toHaveBeenCalledTimes(1);
  expect(legacyAliases).not.toHaveBeenCalled();
  hook.rerender({ source: { ...source, times: { ...source.times, inbox: 2 } } });
  await flush();
  expect(releaseMigrationSources).toHaveBeenCalledTimes(2);
  expect(legacyAliases).not.toHaveBeenCalled();
});

it('never consumes cached or mixed refresh data as a notification baseline', async () => {
  const repository = {
    load: async () => defaultWorkspace(),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const { result, rerender } = renderHook(
    ({ liveReady }) => {
      const workspace = useWorkspace(repository);
      const notices = useInboxNotifications({ ...github, liveReady }, [activity], workspace);
      return { workspace, notices };
    },
    { initialProps: { liveReady: false } },
  );
  await flush();
  expect(result.current.workspace.data.inboxSeen[key]).toBeUndefined();
  expect(result.current.notices.toast).toBe('');
  rerender({ liveReady: true });
  await flush();
  expect(result.current.workspace.data.inboxSeen[key]).toEqual([activity.id]);
  expect(result.current.notices.toast).toBe('');
});

it('does not announce historical records when changing the search range', async () => {
  const preferences = { ...defaultWorkspace().preferences, quietStart: '00:00', quietEnd: '00:00' };
  const repository = {
    load: async () => ({
      ...defaultWorkspace(),
      preferences,
      inboxSeen: { [key]: [records[0].id] },
    }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const { result, rerender } = renderHook(
    ({ days, items }) => {
      const workspace = useWorkspace(repository);
      return useInboxNotifications({ ...github, searchDays: days }, items, workspace);
    },
    { initialProps: { days: 7, items: [records[0]] } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  rerender({ days: 30, items: [records[0], records[1]] });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.toast).toBe('');
});

it.each(['enabled', 'disabled', 'quiet', 'self', 'filtered', 'initial'] as const)(
  'plays one sound per eligible refresh batch: %s',
  async (mode) => {
    const saved = defaultWorkspace();
    saved.preferences.notificationSoundEnabled = mode !== 'disabled';
    saved.preferences.notificationSound = 'double';
    saved.preferences.quietStart = mode === 'quiet' ? '00:00' : '22:00';
    saved.preferences.quietEnd = mode === 'quiet' ? '23:59' : '08:00';
    if (mode === 'filtered') {
      saved.preferences.notifyAttention = false;
      saved.preferences.notifyComments = false;
      saved.preferences.notifyCommits = false;
    }
    if (mode !== 'initial') saved.inboxSeen[key] = [activity.id];
    const changed = { ...activity, id: `${activity.id}:sound`, selfEvent: mode === 'self' };
    const repository = { load: async () => saved, save: vi.fn().mockResolvedValue(undefined) };
    const hook = renderHook(() => {
      const workspace = useWorkspace(repository);
      return useInboxNotifications(
        github,
        [changed, { ...changed, id: `${changed.id}:2` }],
        workspace,
      );
    });
    await flush();
    await flush();
    if (mode === 'enabled') {
      expect(playNotificationSound).toHaveBeenCalledExactlyOnceWith('double');
      hook.rerender();
      await flush();
      expect(playNotificationSound).toHaveBeenCalledOnce();
    } else expect(playNotificationSound).not.toHaveBeenCalled();
  },
);

it.each(
  [
    'github:7:owner/project:activity:pull-1042-v3-1lywzxc:2026-10-29T04:00:00Z',
    'github:7:owner/project:activity:pull-1042-v3-scuhl0:2026-10-29T04:00:00Z',
  ].flatMap((previous) => [
    { previous, read: true },
    { previous, read: false },
  ]),
)(
  'preserves upgrade state without alerts or sounds for checkpoint $previous (read: $read)',
  async ({ previous, read }) => {
    const expanded = {
      ...record,
      comments: {
        totalCount: 2,
        nodes: [
          {
            body: 'Older comment',
            author: { login: 'reviewer' },
            createdAt: '2026-10-28T04:00:00Z',
          },
          ...record.comments.nodes,
        ],
      },
    };
    const oldRead = 'github:7:owner/project:activity:pull-1042-v3-1lywzxc:2026-10-29T04:00:00Z';
    const current = activityFromGitHub(expanded, user.id, repo, user.login);
    let saved = {
      ...defaultWorkspace(),
      preferences: { ...defaultWorkspace().preferences, notificationSoundEnabled: true },
      read: read ? [oldRead] : [],
      inboxSeen: { [key]: [previous] },
    };
    const repository = {
      load: async () => JSON.parse(JSON.stringify(saved)),
      save: vi.fn(async (data: WorkspaceData) => {
        saved = JSON.parse(JSON.stringify(data));
      }),
    };
    const source = {
      ...github,
      legacyAliases: (ids: readonly string[], targets: readonly Activity[]) =>
        findLegacyActivityAliases([expanded], targets, ids, user.id, repo),
    };
    const mount = () =>
      renderHook(
        ({ items }) => {
          const workspace = useWorkspace(repository);
          return { workspace, notices: useInboxNotifications(source, items, workspace) };
        },
        { initialProps: { items: [current] } },
      );
    const first = mount();
    await flush();
    await flush();
    expect(first.result.current.workspace.data.read).toEqual(read ? [current.id] : []);
    expect(first.result.current.workspace.data.inboxSeen[key]).toEqual([current.id]);
    expect(first.result.current.notices.toast).toBe('');
    expect(playNotificationSound).not.toHaveBeenCalled();
    first.unmount();
    const restarted = mount();
    await flush();
    await flush();
    expect(restarted.result.current.workspace.data.read).toEqual(read ? [current.id] : []);
    expect(restarted.result.current.notices.toast).toBe('');
    const changed = activityFromGitHub(
      {
        ...expanded,
        comments: {
          ...expanded.comments,
          nodes: [{ ...expanded.comments.nodes.at(-1)!, body: 'New external comment' }],
          totalCount: 3,
        },
      },
      user.id,
      repo,
      user.login,
    );
    restarted.rerender({ items: [changed] });
    await flush();
    expect(restarted.result.current.notices.toast).toBe('PR #1042 有新动态');
    expect(restarted.result.current.workspace.data.read).not.toContain(changed.id);
    expect(playNotificationSound).toHaveBeenCalledOnce();
  },
);
