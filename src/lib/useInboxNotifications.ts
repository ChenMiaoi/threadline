import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { newUpdates, quietHours, shouldNotify } from '../core/inbox';
import { legacyActivityStateIds, migrateActivityState } from '../core/migrate-activity-state';
import { MAX_INBOX_REVISIONS } from '../core/workspace';
import type { Activity } from '../features/activity/model';
import type { GitHubWorkspace } from './useGitHub';
import type { useWorkspace } from './useWorkspace';
import { notifyDesktop } from './notifications';

export function useInboxNotifications(
  github: GitHubWorkspace,
  records: Activity[],
  workspace: ReturnType<typeof useWorkspace>,
) {
  const observedScope = useRef(github.searchDays);
  const [toast, setToast] = useState({ key: '', text: '' });
  const [error, setError] = useState({ key: '', text: '' });
  const observe = useEffectEvent(() => {
    if (
      !github.key ||
      github.syncing ||
      github.liveReady === false ||
      !github.times.inbox ||
      github.errors.inbox ||
      github.errors.authored ||
      github.errors.review ||
      github.errors.issues ||
      !workspace.loaded ||
      workspace.error ||
      records.length > MAX_INBOX_REVISIONS
    )
      return;
    try {
      const seen = workspace.data.inboxSeen[github.key];
      const scopeChanged = observedScope.current !== github.searchDays;
      observedScope.current = github.searchDays;
      const observed = scopeChanged ? [] : newUpdates(records, seen);
      const ids = records.map((record) => record.id);
      const known = new Set(seen);
      if (seen && ids.length === seen.length && ids.every((id) => known.has(id))) return;
      const candidates = seen ? observed : records;
      const legacy = candidates.length
        ? legacyActivityStateIds(workspace.data).filter((id) =>
            id.startsWith(`github:${github.key}:`),
          )
        : [];
      const aliases = legacy.length
        ? github.legacyAliases(legacy, candidates)
        : new Map<string, Activity>();
      const migrated = new Set([...aliases.values()].map((record) => record.id));
      const changes = observed.filter((record) => !migrated.has(record.id));
      const changed = new Set(changes.map((record) => record.id));
      workspace.update((current) => {
        const next = migrateActivityState(current, aliases);
        return {
          ...next,
          read: next.read.filter((id) => !changed.has(id)),
          inboxSeen: {
            ...next.inboxSeen,
            [github.key]: ids,
          },
        };
      });
      const notify = changes.filter(
        (record) =>
          !(record.id in workspace.data.snoozed) &&
          shouldNotify(record, workspace.data.preferences),
      );
      if (!notify.length || quietHours(workspace.data.preferences, new Date())) return;
      const message =
        notify.length === 1
          ? `${notify[0].kind === 'pull' ? 'PR' : 'Issue'} #${notify[0].number} 有新动态`
          : `${notify.length} 条 PR / Issue 有新动态`;
      setToast({ key: github.key, text: message });
      if (workspace.data.preferences.desktopNotifications)
        void notifyDesktop('ThreadLine · 新动态', `${github.repo} · ${message}`).catch((reason) =>
          setError({ key: github.key, text: String(reason) }),
        );
    } finally {
      github.releaseMigrationSources();
    }
  });
  const revisions = records.map((record) => record.id).join('|');
  useEffect(() => {
    const timer = setTimeout(observe, 0);
    return () => clearTimeout(timer);
  }, [
    github.key,
    github.searchDays,
    github.syncing,
    github.liveReady,
    github.times.inbox,
    github.times.review,
    github.errors.inbox,
    github.errors.authored,
    github.errors.review,
    github.errors.issues,
    workspace.loaded,
    workspace.error,
    revisions,
  ]);
  useEffect(() => {
    if (!toast.text) return;
    const timer = setTimeout(() => setToast({ key: '', text: '' }), 10000);
    return () => clearTimeout(timer);
  }, [toast]);
  return {
    toast: toast.key === github.key ? toast.text : '',
    error: error.key === github.key ? error.text : '',
    dismiss: () => setToast({ key: '', text: '' }),
    clearError: () => setError({ key: '', text: '' }),
  };
}
