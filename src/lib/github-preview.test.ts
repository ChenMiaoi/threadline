import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubGateway } from './github';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
describe('browser development gateway', () => {
  it('uses only the local development endpoint with an explicit command envelope', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        value: { user: { id: 7, login: 'contributor' }, selected: null },
      }),
    });
    vi.stubGlobal('fetch', fetch);
    expect((await githubGateway.session()).user.login).toBe('contributor');
    expect(fetch).toHaveBeenCalledWith('/__threadline/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Threadline-Preview': '1' },
      body: JSON.stringify({ command: 'github_session', args: {} }),
    });
  });
  it('exposes backend failures instead of silently falling back to sample data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'GH_AUTH_REQUIRED' }),
      }),
    );
    await expect(githubGateway.session()).rejects.toThrow('GH_AUTH_REQUIRED');
  });
});
