// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultAccess } from './VaultAccess';
import { GitHubLoginButton } from './GitHubLogin';
import type { GitHubWorkspace } from '../../lib/useGitHub';

afterEach(cleanup);
function workspace(exists = false) {
  return {
    vault: { exists, unlocked: false },
    vaultBusy: false,
    vaultError: '',
    connecting: false,
    auth: { busy: false, state: { status: 'idle' } },
    unlockVault: vi.fn().mockResolvedValue(true),
    lockVault: vi.fn().mockResolvedValue(undefined),
  } as unknown as GitHubWorkspace;
}
describe('local encrypted credential vault', () => {
  it('requires matching masked master-password fields before first creation', async () => {
    const github = workspace();
    render(
      <>
        <VaultAccess github={github} />
        <GitHubLoginButton github={github} />
      </>,
    );
    expect(screen.getByLabelText('主密码').getAttribute('type')).toBe('password');
    expect(screen.getByLabelText('确认主密码').getAttribute('type')).toBe('password');
    expect(
      (screen.getByRole('button', { name: '登录 GitHub' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('主密码'), {
      target: { value: 'test-only master password' },
    });
    fireEvent.change(screen.getByLabelText('确认主密码'), {
      target: { value: 'different test password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: '创建加密凭据库' }));
    expect(screen.getByRole('alert').textContent).toContain('不一致');
    expect(github.unlockVault).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('确认主密码'), {
      target: { value: 'test-only master password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: '创建加密凭据库' }));
    await waitFor(() =>
      expect(github.unlockVault).toHaveBeenCalledWith('test-only master password'),
    );
    await waitFor(() =>
      expect((screen.getByLabelText('主密码') as HTMLInputElement).value).toBe(''),
    );
    expect((screen.getByLabelText('确认主密码') as HTMLInputElement).value).toBe('');
  });
  it('unlocks an existing vault without asking for a new password or exposing it in errors', async () => {
    const github = workspace(true);
    const view = render(<VaultAccess github={github} />);
    expect(screen.queryByLabelText('确认主密码')).toBeNull();
    fireEvent.change(screen.getByLabelText('主密码'), {
      target: { value: 'test-only master password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: '解锁加密凭据库' }));
    await waitFor(() => expect(github.unlockVault).toHaveBeenCalledOnce());
    github.vaultError = 'GH_VAULT_INVALID: 主密码不正确或凭据库已损坏。';
    view.rerender(<VaultAccess github={github} />);
    expect(screen.getByRole('alert').textContent).not.toContain('test-only master password');
  });
  it('offers locking after unlock and disables repeated actions while busy', () => {
    const github = workspace(true);
    github.vault.unlocked = true;
    const view = render(<VaultAccess github={github} />);
    fireEvent.click(screen.getByRole('button', { name: '锁定凭据库' }));
    expect(github.lockVault).toHaveBeenCalledOnce();
    github.vaultBusy = true;
    view.rerender(<VaultAccess github={github} />);
    expect((screen.getByRole('button', { name: '锁定凭据库' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
