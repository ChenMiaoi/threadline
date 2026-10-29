// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
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
      onConnect={vi.fn()}
      onSync={vi.fn()}
      appState={null}
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
