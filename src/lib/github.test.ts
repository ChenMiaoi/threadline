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
  it('passes the expected PR revision through the desktop protocol for lazy sections', async () => {
    vi.mocked(invoke).mockResolvedValue({ payload: [], stale: false });
    await githubGateway.request('files', 'owner/repository', 7, 42, 'a'.repeat(40));
    expect(invoke).toHaveBeenCalledWith('github_request', {
      operation: 'files',
      repo: 'owner/repository',
      accountId: 7,
      number: 42,
      head: 'a'.repeat(40),
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
});

it('uses dedicated local-only cache commands with the complete resource identity', async () => {
  vi.mocked(invoke).mockResolvedValue(null);
  await githubGateway.cachedSession!();
  expect(invoke).toHaveBeenCalledWith('github_cached_session', undefined);
  await githubGateway.cached!('files', 'owner/repository', 7, 42, 'b'.repeat(40));
  expect(invoke).toHaveBeenCalledWith('github_cached_request', {
    operation: 'files',
    repo: 'owner/repository',
    accountId: 7,
    number: 42,
    head: 'b'.repeat(40),
  });
});
