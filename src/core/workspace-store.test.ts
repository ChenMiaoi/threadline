import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from './workspace-store';
import { defaultWorkspace } from './workspace';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('workspace persistence recovery', () => {
  it('retries a failed load without saving defaults over existing data', async () => {
    const stored = { ...defaultWorkspace(), read: ['pull-1'] };
    const repository = {
      load: vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(stored),
      save: vi.fn(),
    };
    const store = createWorkspaceStore(repository);
    await expect(store.load()).rejects.toThrow('unavailable');
    store.update((data) => ({ ...data, read: ['incorrect'] }));
    expect(repository.save).not.toHaveBeenCalled();
    await store.retry();
    expect(store.getSnapshot().data.read).toEqual(['pull-1']);
    expect(store.getSnapshot().error).toBe('');
  });
  it('keeps newer edits after a failed write and retries only the latest snapshot', async () => {
    const first = deferred();
    const repository = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined),
    };
    const store = createWorkspaceStore(repository);
    await store.load();
    store.update((data) => ({ ...data, read: ['first'] }));
    const pending = store.flush();
    store.update((data) => ({ ...data, read: ['latest'] }));
    first.reject(new Error('disk full'));
    await expect(pending).rejects.toThrow('disk full');
    expect(store.getSnapshot().data.read).toEqual(['latest']);
    expect(store.getSnapshot().dirty).toBe(true);
    await store.retry();
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls.map(([data]) => data.read)).toEqual([['latest'], ['latest']]);
    expect(store.getSnapshot().dirty).toBe(false);
  });
  it('serializes writes and flush waits for edits arriving during a write', async () => {
    const first = deferred();
    const repository = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined),
    };
    const store = createWorkspaceStore(repository);
    await store.load();
    store.update((data) => ({ ...data, read: ['first'] }));
    await Promise.resolve();
    store.update((data) => ({ ...data, read: ['second'] }));
    const flushing = store.flush();
    expect(repository.save).toHaveBeenCalledTimes(1);
    first.resolve();
    await flushing;
    expect(repository.save.mock.calls.map(([data]) => data.read)).toEqual([['first'], ['second']]);
    expect(store.getSnapshot().saving).toBe(false);
  });
});
