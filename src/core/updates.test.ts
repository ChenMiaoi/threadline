import { describe, expect, it, vi } from 'vitest';
import { createUpdateStore, type UpdatePackage } from './updates';

function setup(enabled = true) {
  const update: UpdatePackage = {
    version: '0.2.0',
    body: 'Changes',
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    info: vi.fn().mockResolvedValue({ version: '0.1.0', channel: 'stable', enabled }),
    check: vi.fn().mockResolvedValue(update),
    restart: vi.fn().mockResolvedValue(undefined),
  };
  return { update, gateway, store: createUpdateStore(gateway) };
}
describe('application updates', () => {
  it('does not report an unconfigured build as current', async () => {
    const { store, gateway } = setup(false);
    await store.initialize();
    await store.check();
    expect(store.getSnapshot().status).toBe('unavailable');
    expect(gateway.check).not.toHaveBeenCalled();
  });
  it('distinguishes no update from a failed check and allows retry', async () => {
    const { store, gateway } = setup();
    gateway.check.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    await store.check();
    expect(store.getSnapshot().status).toBe('error');
    expect(store.getSnapshot().checkedAt).toBe(0);
    await store.check();
    expect(store.getSnapshot().status).toBe('current');
    expect(store.getSnapshot().error).toBe('');
  });
  it('retains the update after a failed download, reports progress and prevents duplicate downloads', async () => {
    const { store, update } = setup();
    await store.check();
    vi.mocked(update.download).mockRejectedValueOnce(new Error('signature rejected'));
    await store.download();
    expect(store.getSnapshot().status).toBe('available');
    expect(update.install).not.toHaveBeenCalled();
    let finish!: () => void;
    vi.mocked(update.download).mockImplementationOnce(async (progress) => {
      progress(25, 100);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const downloading = store.download();
    await store.download();
    expect(update.download).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().received).toBe(25);
    finish();
    await downloading;
    expect(store.getSnapshot().status).toBe('ready');
  });
  it('blocks installation on save failure and waits for persistence before installing and restarting', async () => {
    const { store, update, gateway } = setup();
    await store.check();
    await store.download();
    const flush = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    await store.install(flush);
    expect(update.install).not.toHaveBeenCalled();
    expect(gateway.restart).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe('ready');
    await store.install(flush);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(update.install).toHaveBeenCalledTimes(1);
    expect(gateway.restart).toHaveBeenCalledTimes(1);
    expect(flush.mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(update.install).mock.invocationCallOrder[0],
    );
  });
  it('retries restart without installing twice', async () => {
    const { store, update, gateway } = setup();
    await store.check();
    await store.download();
    gateway.restart.mockRejectedValueOnce(new Error('restart failed'));
    await store.install(async () => {});
    expect(store.getSnapshot().status).toBe('restart');
    await store.install(async () => {});
    expect(update.install).toHaveBeenCalledTimes(1);
    expect(gateway.restart).toHaveBeenCalledTimes(2);
  });
  it('releases an update that arrives after disposal', async () => {
    const { store, update, gateway } = setup();
    await store.initialize();
    let finish!: (update: UpdatePackage) => void;
    gateway.check.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = store.check();
    store.dispose();
    finish(update);
    await pending;
    expect(update.close).toHaveBeenCalledTimes(1);
  });
});
