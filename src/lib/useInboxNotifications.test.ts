// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityFromGitHub } from '../core/github';
import { defaultWorkspace, MAX_INBOX_REVISIONS, type WorkspaceData } from '../core/workspace';
import { record, repo, user } from '../test/github.fixture';
import type { GitHubWorkspace } from './useGitHub';
import { useInboxNotifications } from './useInboxNotifications';
import { useWorkspace } from './useWorkspace';

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
} as GitHubWorkspace;
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('inbox notifications', () => {
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
