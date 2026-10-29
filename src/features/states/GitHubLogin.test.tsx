// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubLoginDialog } from './GitHubLogin';
import { createGateway, user } from '../../test/github.fixture';
import type { GitHubWorkspace } from '../../lib/useGitHub';

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
function workspace() {
  return {
    session: { user, selected: null },
    connecting: false,
    gateway: createGateway(),
    auth: {
      state: {
        status: 'waiting',
        code: 'ABCD-1234',
        verificationUrl: 'https://github.com/login/device',
        error: null,
      },
      busy: true,
      start: vi.fn(),
      cancel: vi.fn(),
    },
  } as unknown as GitHubWorkspace;
}

describe('in-app GitHub authorization', () => {
  it('automatically opens the official authorization page once per device code', async () => {
    const github = workspace();
    const view = render(<GitHubLoginDialog github={github} />);
    expect(screen.getByRole('dialog', { name: '登录 GitHub' })).toBeTruthy();
    expect(screen.getByText(/ThreadLine 独立 GitHub App 授权/)).toBeTruthy();
    expect(screen.getByText(/不授予写入、删除仓库或管理公钥的权限/)).toBeTruthy();
    await waitFor(() => expect(github.gateway.open).toHaveBeenCalledOnce());
    view.rerender(
      <GitHubLoginDialog
        github={{ ...github, auth: { ...github.auth, state: { ...github.auth.state } } }}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(github.gateway.open).toHaveBeenCalledOnce();
  });
  it('shows the device code and offers copying, official authorization, and cancellation', async () => {
    const github = workspace();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<GitHubLoginDialog github={github} />);
    expect(screen.getByLabelText('GitHub 验证码').textContent).toBe('ABCD-1234');
    fireEvent.click(screen.getByRole('button', { name: '复制验证码' }));
    await screen.findByText('验证码已复制');
    expect(writeText).toHaveBeenCalledWith('ABCD-1234');
    fireEvent.click(screen.getByRole('button', { name: '重新打开授权页 ↗' }));
    expect(github.gateway.open).toHaveBeenCalledWith('https://github.com/login/device');
    fireEvent.click(screen.getByRole('button', { name: '取消登录' }));
    expect(github.auth.cancel).toHaveBeenCalledOnce();
  });
  it('provides manual fallbacks when clipboard or browser opening is unavailable', async () => {
    const github = workspace();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    vi.mocked(github.gateway.open).mockRejectedValue(new Error('unavailable'));
    render(<GitHubLoginDialog github={github} />);
    fireEvent.click(screen.getByRole('button', { name: '复制验证码' }));
    await screen.findByText(/无法自动复制/);
    fireEvent.click(screen.getByRole('button', { name: '重新打开授权页 ↗' }));
    expect((await screen.findByRole('alert')).textContent).toContain('github.com/login/device');
  });
  it('exposes retry after authentication failure', async () => {
    const github = workspace();
    github.auth.state = {
      status: 'error',
      code: null,
      verificationUrl: null,
      error: '登录已超时，请重试。',
    };
    github.auth.busy = false;
    render(<GitHubLoginDialog github={github} />);
    expect(screen.getByRole('alert').textContent).toContain('登录已超时');
    fireEvent.click(screen.getByRole('button', { name: '重试登录' }));
    await waitFor(() => expect(github.auth.start).toHaveBeenCalledOnce());
  });
});
