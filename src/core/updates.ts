export interface UpdatePackage {
  version: string;
  body?: string;
  download(progress: (received: number, total?: number) => void): Promise<void>;
  install(): Promise<void>;
  close(): Promise<void>;
}
export interface UpdateGateway {
  info(): Promise<{ version: string; enabled: boolean; channel: string }>;
  check(): Promise<UpdatePackage | null>;
  restart(): Promise<void>;
}
export type UpdateStatus =
  | 'loading'
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'restart'
  | 'error';
export function createUpdateStore(gateway: UpdateGateway) {
  let state = {
    status: 'loading' as UpdateStatus,
    version: '',
    channel: '',
    nextVersion: '',
    notes: '',
    received: 0,
    total: undefined as number | undefined,
    checkedAt: 0,
    error: '',
  };
  const listeners = new Set<() => void>();
  let update: UpdatePackage | null = null;
  let initialized = false;
  let busy = false;
  let epoch = 0;
  function publish(change: Partial<typeof state>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }
  async function initialize() {
    if (initialized || busy) return;
    busy = true;
    try {
      const info = await gateway.info();
      initialized = true;
      publish({
        version: info.version,
        channel: info.channel,
        status: info.enabled ? 'idle' : 'unavailable',
      });
    } catch (reason) {
      publish({ status: 'error', error: String(reason) });
    } finally {
      busy = false;
    }
  }
  async function check() {
    if (busy || ['ready', 'restart', 'unavailable'].includes(state.status)) return;
    if (!initialized) {
      await initialize();
      if (!initialized || state.status === 'unavailable') return;
    }
    busy = true;
    const token = epoch;
    publish({ status: 'checking', error: '' });
    try {
      if (update) {
        await update.close();
        update = null;
      }
      const found = await gateway.check();
      if (epoch !== token) {
        await found?.close();
        return;
      }
      update = found;
      publish({
        status: found ? 'available' : 'current',
        nextVersion: found?.version ?? '',
        notes: found?.body ?? '',
        checkedAt: Date.now(),
        received: 0,
        total: undefined,
      });
    } catch (reason) {
      if (epoch === token) publish({ status: 'error', error: String(reason) });
    } finally {
      busy = false;
    }
  }
  async function download() {
    if (busy || !update || state.status !== 'available') return;
    busy = true;
    publish({ status: 'downloading', received: 0, total: undefined, error: '' });
    try {
      await update.download((received, total) => publish({ received, total }));
      publish({ status: 'ready' });
    } catch (reason) {
      publish({ status: 'available', error: `下载失败：${String(reason)}` });
    } finally {
      busy = false;
    }
  }
  async function install(flush: () => Promise<void>) {
    if (busy || !update || !['ready', 'restart'].includes(state.status)) return;
    const alreadyInstalled = state.status === 'restart';
    busy = true;
    publish({ status: 'installing', error: '' });
    let installed = alreadyInstalled;
    try {
      await flush();
      if (!alreadyInstalled) await update.install();
      installed = true;
      publish({ status: 'restart' });
      await gateway.restart();
    } catch (reason) {
      publish({ status: installed ? 'restart' : 'ready', error: `更新未完成：${String(reason)}` });
    } finally {
      busy = false;
    }
  }
  function dispose() {
    ++epoch;
    if (update && !busy) {
      void update.close().catch(() => undefined);
      update = null;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize,
    check,
    download,
    install,
    dispose,
  };
}
