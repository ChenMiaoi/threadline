import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { releaseDue, type WorkspaceRepository } from '../core/workspace';
import { createWorkspaceStore } from '../core/workspace-store';

export function useWorkspace(repository: WorkspaceRepository) {
  const store = useMemo(() => createWorkspaceStore(repository), [repository]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.load().catch(() => undefined);
    const timer = setInterval(
      () => store.update((current) => releaseDue(current, Date.now())),
      30_000,
    );
    return () => clearInterval(timer);
  }, [store]);
  return { ...state, update: store.update, retry: store.retry, flush: store.flush };
}
