// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { enableDesktopNotifications } from '../../lib/notifications';

vi.mock('../../lib/notifications', () => ({
  enableDesktopNotifications: vi.fn(),
  notifyDesktop: vi.fn(),
}));
import { useGitHub } from '../../lib/useGitHub';
import { createGateway } from '../../test/github.fixture';
import { defaultWorkspace } from '../../core/workspace';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterEach(cleanup);

async function settings() {
  const { result } = renderHook(() => useGitHub(0, createGateway()));
  await waitFor(() => expect(result.current.session).not.toBeNull());
  const disconnect = vi.fn().mockResolvedValue(undefined);
  render(
    <SettingsPage
      preferences={defaultWorkspace().preferences}
      onChange={vi.fn()}
      onSync={vi.fn()}
      github={{ ...result.current, disconnect }}
      onChooseRepository={vi.fn()}
    />,
  );
  const trigger = screen.getByRole('button', { name: '退出 ThreadLine 登录' });
  trigger.focus();
  fireEvent.click(trigger);
  return {
    disconnect,
    trigger,
    dialog: screen.getByRole('dialog', { name: '退出 ThreadLine 登录？' }),
  };
}

describe('sign-out confirmation', () => {
  it.each(['取消', 'Escape', '关闭弹窗'])(
    'keeps the login when dismissing with %s and restores focus',
    async (method) => {
      const { disconnect, trigger, dialog } = await settings();
      expect(trigger.classList.contains('settings-danger')).toBe(true);
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' }));
      expect(dialog.textContent).toContain('删除本机保存的登录凭据和账号缓存');
      expect(dialog.textContent).toContain('GitHub 数据不会被删除');
      expect(disconnect).not.toHaveBeenCalled();
      if (method === 'Escape')
        fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
      else fireEvent.click(within(dialog).getByRole('button', { name: method }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(disconnect).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);
    },
  );
  it('disconnects only after the explicit danger action is confirmed', async () => {
    const { disconnect, dialog } = await settings();
    const confirm = within(dialog).getByRole('button', { name: '确认退出登录' });
    expect(confirm.classList.contains('settings-danger')).toBe(true);
    fireEvent.click(confirm);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

it('keeps reauthorization disabled while connecting and omits diagnostic controls', async () => {
  const { result } = renderHook(() => useGitHub(0, createGateway()));
  await waitFor(() => expect(result.current.session).not.toBeNull());
  const start = vi.fn();
  render(
    <SettingsPage
      preferences={defaultWorkspace().preferences}
      onChange={vi.fn()}
      onSync={vi.fn()}
      github={{ ...result.current, connecting: true, auth: { ...result.current.auth, start } }}
      onChooseRepository={vi.fn()}
    />,
  );
  const authorize = screen.getByRole('button', { name: '重新授权 GitHub' }) as HTMLButtonElement;
  expect(authorize.disabled).toBe(true);
  fireEvent.click(authorize);
  expect(start).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '检查连接' })).toBeNull();
  expect(screen.queryByText('本地数据存储')).toBeNull();
  expect(screen.queryByText('加载诊断')).toBeNull();
  expect(
    within(screen.getByRole('region', { name: '登录管理' })).getByRole('button', {
      name: '退出 ThreadLine 登录',
    }),
  ).toBeTruthy();
});

it('disables the notification switch until the permission request completes', async () => {
  const { result } = renderHook(() => useGitHub(0, createGateway()));
  await waitFor(() => expect(result.current.session).not.toBeNull());
  let resolve!: () => void;
  vi.mocked(enableDesktopNotifications).mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  const onChange = vi.fn();
  render(
    <SettingsPage
      preferences={{ ...defaultWorkspace().preferences, desktopNotifications: false }}
      onChange={onChange}
      onSync={vi.fn()}
      github={result.current}
      onChooseRepository={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '通知' }));
  const toggle = screen.getByRole('switch', { name: '桌面通知' }) as HTMLButtonElement;
  fireEvent.click(toggle);
  expect(toggle.disabled).toBe(true);
  fireEvent.click(toggle);
  expect(enableDesktopNotifications).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => resolve());
  expect(toggle.disabled).toBe(false);
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ desktopNotifications: true });
});
