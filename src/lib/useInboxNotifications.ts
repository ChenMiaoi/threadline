import { useEffect, useEffectEvent, useRef } from 'react';
import { newUpdates } from '../core/inbox';
import { legacyActivityStateIds, migrateActivityState } from '../core/migrate-activity-state';
import { MAX_INBOX_REVISIONS } from '../core/workspace';
import type { Activity } from '../features/activity/model';
import type { GitHubWorkspace } from './useGitHub';
import type { useWorkspace } from './useWorkspace';

export function useInboxNotifications(
  github: GitHubWorkspace,
  records: Activity[],
  workspace: ReturnType<typeof useWorkspace>,
) {
  const observedScope = useRef(github.searchDays);
  const observe = useEffectEvent(() => {
    if (!github.key || !workspace.loaded || workspace.error || records.length > MAX_INBOX_REVISIONS)
      return;
    const legacy = records.length
      ? legacyActivityStateIds(workspace.data).filter((id) =>
          id.startsWith(`github:${github.key}:`),
        )
      : [];
    const aliases = legacy.length
      ? github.legacyAliases(legacy, records)
      : new Map<string, Activity>();
    const persistMigration = () => {
      if (aliases.size) workspace.update((current) => migrateActivityState(current, aliases));
    };
    // Exact identity migration is safe for cached data; notifications still require a live sync.
    if (
      github.syncing ||
      github.liveReady === false ||
      !github.times.inbox ||
      github.errors.inbox ||
      github.errors.authored ||
      github.errors.review ||
      github.errors.issues
    ) {
      persistMigration();
      return;
    }
    try {
      const seen = workspace.data.inboxSeen[github.key];
      const scopeChanged = observedScope.current !== github.searchDays;
      observedScope.current = github.searchDays;
      const observed = scopeChanged ? [] : newUpdates(records, seen);
      const ids = records.map((record) => record.id);
      const known = new Set(seen);
      if (seen && ids.length === seen.length && ids.every((id) => known.has(id))) {
        persistMigration();
        return;
      }
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
}
