import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { githubGateway } from './github';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }));
describe('GitHub desktop boundary', () => {
  beforeEach(() => vi.resetAllMocks());
  it('uses typed collaboration commands without sending GitHub tokens or shell arguments', async () => {
    vi.mocked(invoke).mockResolvedValue({ payload: [], stale: false });
    await githubGateway.request('authored', 'owner/repository', 7);
    expect(invoke).toHaveBeenCalledWith('github_request', {
      operation: 'authored',
      repo: 'owner/repository',
      accountId: 7,
      number: 0,
    });
    await githubGateway.select('owner/repository', 7);
    expect(invoke).toHaveBeenCalledWith('github_select_repository', {
      repo: 'owner/repository',
      accountId: 7,
    });
  });
  it('propagates login failures instead of replacing them with records', async () => {
    vi.mocked(invoke).mockRejectedValue('GH_AUTH_REQUIRED');
    await expect(githubGateway.session()).rejects.toBe('GH_AUTH_REQUIRED');
  });
  it('disconnects through the app-specific credential command without passing a token', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await githubGateway.logout();
    expect(invoke).toHaveBeenCalledWith('github_logout', undefined);
  });
  it('sends vault passwords only to the local unlock command', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await githubGateway.unlockVault('test-only master password');
    expect(invoke).toHaveBeenCalledWith('github_vault_unlock', {
      password: 'test-only master password',
    });
    expect(invoke).toHaveBeenCalledOnce();
  });
});
