import {
  defaultWorkspace,
  normalizeWorkspace,
  type WorkspaceData,
  type WorkspaceRepository,
} from './workspace';

export function createWorkspaceStore(repository: WorkspaceRepository) {
  let state = {
    data: defaultWorkspace(),
    loaded: false,
    saving: false,
    dirty: false,
    error: '',
    errorKind: 'load' as 'load' | 'save',
  };
  const listeners = new Set<() => void>();
  let loading: Promise<void> | undefined;
  let writing: Promise<void> | undefined;
  function publish(change: Partial<typeof state>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }
  function load(): Promise<void> {
    if (state.loaded) return Promise.resolve();
    if (loading) return loading;
    publish({ error: '' });
    loading = Promise.resolve()
      .then(() => repository.load())
      .then((value) => {
        publish({ data: normalizeWorkspace(value, Date.now()), loaded: true, error: '' });
      })
      .catch((reason: unknown) => {
        publish({ error: String(reason), errorKind: 'load' });
        throw reason;
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  }
  function flush(): Promise<void> {
    if (writing) return writing;
    if (!state.loaded) return Promise.reject(new Error('本地数据尚未读取，请先重试读取。'));
    publish({ saving: true, error: '' });
    writing = Promise.resolve()
      .then(async () => {
        while (state.dirty) {
          const snapshot = state.data;
          await repository.save(snapshot);
          // Edits made during a write must be saved before allowing a restart.
          publish({ dirty: state.data !== snapshot });
        }
      })
      .catch((reason: unknown) => {
        publish({ error: String(reason), errorKind: 'save' });
        throw reason;
      })
      .finally(() => {
        writing = undefined;
        publish({ saving: false });
      });
    return writing;
  }
  function update(change: (current: WorkspaceData) => WorkspaceData) {
    if (!state.loaded) return;
    const data = change(state.data);
    if (data === state.data) return;
    publish({ data, dirty: true });
    if (!state.error) void flush().catch(() => undefined);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    flush,
    update,
    retry: () => (state.loaded ? flush() : load()),
  };
}
