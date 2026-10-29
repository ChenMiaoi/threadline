// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { Modal } from './components/Modal';
import { createGateway, notifications, repo, user, updated } from './test/github.fixture';
import { recordId } from './core/github';
import { response } from './test/github.fixture';

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
  it('keeps repository access failures in the picker without losing the current page', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.select).mockRejectedValue('GH_NOT_FOUND');
    render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '仓库与同步' }));
    fireEvent.click(screen.getByRole('button', { name: '选择仓库' }));
    await screen.findByRole('radio', { name: /owner\/other/ });
    fireEvent.change(screen.getByRole('textbox', { name: '仓库完整名称' }), {
      target: { value: 'owner/missing' },
    });
    fireEvent.click(screen.getByRole('button', { name: '打开仓库' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'GH_NOT_FOUND');
    expect(screen.getByRole('dialog', { name: '选择仓库' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }));
    expect(screen.getByRole('heading', { name: '仓库与同步', level: 1 })).toBeTruthy();
  });
  it('distinguishes failed synchronization from an empty list and retries real requests', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi
      .fn()
      .mockImplementation((operation, repository, accountId, number) =>
        operation === 'authored'
          ? Promise.reject('GH_FORBIDDEN')
          : request(operation, repository, accountId, number),
      );
    render(<App gateway={gateway} />);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('GH_FORBIDDEN'),
    );
    expect(screen.queryByRole('heading', { name: '当前筛选下没有 PR' })).toBeNull();
    gateway.request = request;
    fireEvent.click(screen.getByRole('button', { name: '重试同步' }));
    await screen.findByRole('textbox', { name: '搜索 PR' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps the current settings section when repository selection is cancelled', async () => {
    render(<App gateway={createGateway()} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '仓库与同步' }));
    fireEvent.click(screen.getByRole('button', { name: '选择仓库' }));
    fireEvent.click(await screen.findByRole('button', { name: '关闭弹窗' }));
    expect(screen.getByRole('heading', { name: '仓库与同步', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '搜索 PR' })).toBeNull();
  });
  it('shows actual login failures without displaying sample records', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValue('GH_NOT_FOUND');
    render(<App gateway={gateway} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'GH_NOT_FOUND');
    expect(screen.queryByRole('textbox', { name: '搜索 PR' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '登录 GitHub' }));
    await waitFor(() => expect(gateway.login).toHaveBeenCalledOnce());
  });
  it('opens repository selection automatically after in-app authorization succeeds', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session)
      .mockRejectedValueOnce('GH_AUTH_REQUIRED')
      .mockResolvedValue({ user, selected: null });
    vi.mocked(gateway.login).mockResolvedValue({
      status: 'complete',
      code: null,
      verificationUrl: null,
      error: null,
    });
    render(<App gateway={gateway} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '登录 GitHub' }));
    expect(await screen.findByRole('dialog', { name: '选择仓库' })).toBeTruthy();
    expect(gateway.session).toHaveBeenCalledTimes(2);
    expect(gateway.request).toHaveBeenCalledWith('repositories', '', user.id);
  });
  it('validates a real repository choice before opening its workspace', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockResolvedValue({ user, selected: null });
    render(<App gateway={gateway} />);
    await screen.findByRole('heading', { name: `已连接 @${user.login}` });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: '选择仓库' }));
    fireEvent.click(await screen.findByRole('radio', { name: /owner\/other.*私有/ }));
    fireEvent.click(screen.getByRole('button', { name: '打开仓库' }));
    await waitFor(() => expect(gateway.select).toHaveBeenCalledWith('owner/other', user.id));
    await screen.findByRole('textbox', { name: '搜索 PR' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('persists explicit unread overrides for notifications already read on GitHub', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi
      .fn()
      .mockImplementation((operation, repository, accountId, number) =>
        operation === 'inbox'
          ? Promise.resolve(response([notifications.map((n) => ({ ...n, unread: false }))]))
          : request(operation, repository, accountId, number),
      );
    render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: /收件箱\s*0/ }));
    fireEvent.click(screen.getByRole('tab', { name: '全部' }));
    fireEvent.click(screen.getAllByRole('button', { name: '标记未读' })[0]);
    fireEvent.click(screen.getByRole('tab', { name: '未读 1' }));
    expect(screen.getByRole('button', { name: /未读\s*#\s*1042/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /未读\s*#\s*1042/ }).textContent).not.toContain(
      '已读',
    );
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).unread).toContain(
        recordId(user.id, repo, 'notification', notifications[0].id, updated),
      ),
    );
  });
  it('keeps PR search when returning from the detail view', async () => {
    render(<App gateway={createGateway()} />);
    const search = await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.change(search, { target: { value: '1042' } });
    expect(screen.queryByRole('button', { name: /Correct source location reporting/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看讨论' }));
    await screen.findByRole('tab', { name: '讨论 1' });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: repo }));
    expect((screen.getByRole('textbox', { name: '搜索 PR' }) as HTMLInputElement).value).toBe(
      '1042',
    );
  });
  it('keeps the inbox badge and read filter consistent across pages', async () => {
    render(<App gateway={createGateway()} />);
    fireEvent.click(await screen.findByRole('button', { name: '标记已读' }));
    fireEvent.click(await screen.findByRole('button', { name: /收件箱\s*3/ }));
    expect(screen.getByRole('tab', { name: '未读 3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /未读\s*#\s*1042/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '全部' }));
    expect(screen.getByRole('button', { name: /已读\s*#\s*1042/ })).toBeTruthy();
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).read).toContain(
        recordId(user.id, repo, 'notification', notifications[0].id, updated),
      ),
    );
  });
  it('restores saved theme preferences after reopening the interface', async () => {
    const app = render(<App gateway={createGateway()} />);
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
    render(<App gateway={createGateway()} />);
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
