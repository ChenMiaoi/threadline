import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { defaultWorkspace } from '../core/workspace';
import { browserWorkspaceRepository, desktopWorkspaceRepository } from './workspace-storage';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
describe('workspace persistence adapters', () => {
  beforeEach(() => vi.resetAllMocks());
  it('round-trips data through injected browser storage', async () => {
    const values = new Map<string, string>();
    const repository = browserWorkspaceRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    });
    expect(await repository.load()).toBeNull();
    const data = defaultWorkspace(Date.now());
    await repository.save(data);
    expect(await repository.load()).toEqual(data);
  });
  it('does not silently replace malformed browser data', async () => {
    const repository = browserWorkspaceRepository({ getItem: () => 'invalid', setItem: vi.fn() });
    await expect(repository.load()).rejects.toThrow();
  });
  it('uses the matching Rust command payloads and propagates errors', async () => {
    const repository = desktopWorkspaceRepository();
    vi.mocked(invoke).mockResolvedValueOnce('null');
    expect(await repository.load()).toBeNull();
    const data = defaultWorkspace(Date.now());
    await repository.save(data);
    expect(invoke).toHaveBeenCalledWith('get_workspace_data');
    expect(invoke).toHaveBeenCalledWith('save_workspace_data', { data: JSON.stringify(data) });
    vi.mocked(invoke).mockRejectedValueOnce('disk full');
    await expect(repository.save(data)).rejects.toBe('disk full');
  });
});
