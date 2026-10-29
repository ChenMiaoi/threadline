// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { Modal } from './components/Modal';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
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
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    },
  });
});
afterEach(cleanup);

describe('workspace interactions', () => {
  it('keeps PR search when returning from the detail view', async () => {
    render(<App />);
    const search = await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.change(search, { target: { value: '1042' } });
    expect(screen.queryByRole('button', { name: /Correct source location reporting/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看讨论' }));
    await screen.findByRole('tab', { name: '讨论 5' });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'llvm-project' }));
    expect((screen.getByRole('textbox', { name: '搜索 PR' }) as HTMLInputElement).value).toBe(
      '1042',
    );
  });
  it('keeps the inbox badge and read filter consistent across pages', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '标记已读' }));
    fireEvent.click(await screen.findByRole('button', { name: /收件箱\s*3/ }));
    expect(screen.getByRole('tab', { name: '未读 3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /未读\s*#\s*1042/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '全部' }));
    expect(screen.getByRole('button', { name: /已读\s*#\s*1042/ })).toBeTruthy();
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).read).toContain(
        'inbox-1042',
      ),
    );
  });
  it('restores saved theme preferences after reopening the interface', async () => {
    const app = render(<App />);
    await screen.findByRole('button', { name: '标记已读' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '外观' }));
    fireEvent.click(screen.getByRole('button', { name: '浅色' }));
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).preferences.theme,
      ).toBe('light'),
    );
    app.unmount();
    render(<App />);
    await screen.findByRole('button', { name: '标记已读' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '外观' }));
    expect(screen.getByRole('button', { name: '浅色 ✓' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
  it('does not dismiss dialogs during Strict Mode effect cleanup', async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Modal title="示例记录" onClose={onClose}>
          <p>Record</p>
        </Modal>
      </StrictMode>,
    );
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '示例记录' }).hasAttribute('open')).toBe(true);
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { bubbles: false, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
