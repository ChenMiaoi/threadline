export interface SyncResult {
  errors: string[];
  cancelled?: boolean;
}

export interface SyncState {
  phase: 'idle' | 'syncing' | 'offline' | 'waiting' | 'blocked';
  nextAttemptAt: number | null;
}

export function retryableSyncError(error: string) {
  return /GH_(REQUEST_FAILED|TIMEOUT|RATE_LIMIT|RESPONSE_ERROR|API_ERROR|TASK_FAILED)/.test(error);
}

export function syncRetryAt(errors: string[]) {
  return Math.max(0, ...errors.map((error) => Number(/retryAt=(\d+)/.exec(error)?.[1] ?? 0)));
}

// Timers, connectivity, and randomness belong to the host, not the synchronization policy.
export function createSyncScheduler(options: {
  interval: number;
  run(force: boolean): Promise<SyncResult>;
  now(): number;
  online(): boolean;
  random(): number;
  schedule(callback: () => void, delay: number): () => void;
  publish(state: SyncState): void;
}) {
  let stopped = false;
  let pending: Promise<void> | null = null;
  let cancel: (() => void) | undefined;
  let failures = 0;
  let blocked = false;
  let retryAt = 0;
  let serverRetryAt = 0;
  let lastAttempt = -Infinity;
  let recoveryQueued = false;
  let recovering = false;
  let pendingForce = false;
  let forcedRefresh: Promise<void> | null = null;

  function publish(phase: SyncState['phase'], nextAttemptAt: number | null = null) {
    if (!stopped) options.publish({ phase, nextAttemptAt });
  }
  function clearTimer() {
    cancel?.();
    cancel = undefined;
  }
  function arm(delay: number) {
    clearTimer();
    if (stopped) return;
    if (!options.online()) return publish('offline');
    const wait = Math.ceil(Math.max(delay, retryAt - options.now(), 0));
    publish('waiting', options.now() + wait);
    cancel = options.schedule(() => void refresh(true, false), Math.min(wait, 2_147_483_647));
  }
  function refresh(force = true, expedite = true): Promise<void> {
    if (stopped) return Promise.resolve();
    if (pending) {
      if (force && !pendingForce) {
        forcedRefresh ??= pending.then(() => {
          forcedRefresh = null;
          return refresh(true, expedite);
        });
        return forcedRefresh;
      }
      return pending;
    }
    clearTimer();
    // Initial cache hydration remains available offline; live reads must wait.
    if (!options.online() && force) {
      publish('offline');
      return Promise.resolve();
    }
    if (expedite) retryAt = serverRetryAt;
    if (retryAt > options.now()) {
      arm(retryAt - options.now());
      return Promise.resolve();
    }
    lastAttempt = options.now();
    pendingForce = force;
    publish(options.online() ? 'syncing' : 'offline');
    pending = Promise.resolve()
      .then(() => options.run(force))
      .catch((reason: unknown): SyncResult => ({ errors: [String(reason)] }))
      .then((result) => {
        if (stopped || result.cancelled) return;
        blocked = result.errors.some((error) => !retryableSyncError(error));
        if (result.errors.length) {
          failures += 1;
          serverRetryAt = syncRetryAt(result.errors);
          const base = Math.min(30_000 * 2 ** Math.min(failures - 1, 4), 300_000);
          retryAt = Math.max(serverRetryAt, options.now() + base * (1 + options.random() * 0.2));
        } else {
          failures = 0;
          retryAt = 0;
          serverRetryAt = 0;
        }
      })
      .finally(() => {
        pending = null;
        if (stopped) return;
        if (recoveryQueued) {
          recoveryQueued = false;
          // A request started before connectivity returned may finish with an old failure.
          if (!blocked) {
            retryAt = serverRetryAt;
            void refresh(true, false).finally(() => {
              recovering = false;
            });
            return;
          }
          recovering = false;
        }
        if (!options.online()) publish('offline');
        else if (blocked) publish('blocked');
        else if (retryAt) arm(retryAt - options.now());
        else if (options.interval) arm(options.interval);
        else publish('idle');
      });
    return pending;
  }
  function recover(immediate = false) {
    if (stopped || blocked || recovering || !options.online()) return;
    if (!immediate && options.now() - lastAttempt < 60_000) return;
    recovering = true;
    if (pending) recoveryQueued = true;
    else
      void refresh(true, immediate).finally(() => {
        recovering = false;
      });
  }
  return {
    start: (force = true) => {
      cancel = options.schedule(() => void refresh(force, false), 0);
    },
    refresh,
    recover,
    offline: () => {
      clearTimer();
      publish('offline');
    },
    stop: () => {
      stopped = true;
      clearTimer();
    },
  };
}
