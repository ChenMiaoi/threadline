import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createUpdateStore, type UpdateGateway } from '../core/updates';
import { updateGateway } from './updates';

export function useUpdates(automatic: boolean, gateway: UpdateGateway = updateGateway) {
  const store = useMemo(() => createUpdateStore(gateway), [gateway]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.initialize();
    return () => store.dispose();
  }, [store]);
  useEffect(() => {
    if (!automatic) return;
    const initial = setTimeout(() => void store.check(), 15_000);
    const timer = setInterval(() => void store.check(), 6 * 60 * 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [automatic, store]);
  return { ...state, check: store.check, download: store.download, install: store.install };
}
