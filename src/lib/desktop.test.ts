import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { loadAppState, saveLastView } from './desktop';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }));

describe('desktop workspace bridge', () => {
  beforeEach(() => vi.resetAllMocks());

  it('loads the persisted workspace from Rust', async () => {
    const state = { databasePath: 'workspace/threadline.db', schemaVersion: 1, lastView: 'review' };
    vi.mocked(invoke).mockResolvedValue(state);
    await expect(loadAppState()).resolves.toEqual(state);
    expect(invoke).toHaveBeenCalledWith('get_app_state');
  });

  it('passes the selected view using the desktop command contract', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await saveLastView('issues');
    expect(invoke).toHaveBeenCalledWith('save_last_view', { view: 'issues' });
  });

  it('propagates storage failures to the interface', async () => {
    vi.mocked(invoke).mockRejectedValue('database is locked');
    await expect(saveLastView('review')).rejects.toBe('database is locked');
    await expect(loadAppState()).rejects.toBe('database is locked');
  });
});
