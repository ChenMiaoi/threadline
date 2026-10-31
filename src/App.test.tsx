// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { Modal } from './components/Modal';
import { createGateway, record, repo, user } from './test/github.fixture';
import { activityFromGitHub } from './core/github';
import { response } from './test/github.fixture';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

beforeEach(() => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
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
  it('combines issues and pull requests chronologically with local unread badges', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi.fn().mockImplementation((operation, repository, accountId, number) =>
      operation === 'activity'
        ? Promise.resolve(
            response([
              {
                data: {
                  search: {
                    issueCount: 2,
                    nodes: [
                      record,
                      {
                        ...record,
                        __typename: 'Issue',
                        number: 77,
                        url: `https://github.com/${repo}/issues/77`,
                        updatedAt: '2026-10-29T15:00:00Z',
                        title: 'Recent issue reply',
                      },
                    ],
                  },
                },
              },
            ]),
          )
        : request(operation, repository, accountId, number),
    );
    render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: /^收件箱/ }));
    const rows = await screen.findAllByRole('button', { name: /(?:PR|Issue) #/ });
    expect(rows[0].textContent).toContain('Issue #77');
    expect(rows[1].textContent).toContain('PR #1042');
    expect(screen.getByRole('tab', { name: '未读 3' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Issue 1' }));
    expect(screen.queryByRole('button', { name: /PR #1042/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('makes an updated read thread unread again and announces it only once', async () => {
    window.localStorage.setItem(
      'threadline.workspace.v1',
      JSON.stringify({ preferences: { quietStart: '00:00', quietEnd: '00:00' } }),
    );
    let head = record.headRefOid;
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi
      .fn()
      .mockImplementation((operation, repository, accountId, number) =>
        operation === 'activity' || operation === 'authored'
          ? Promise.resolve(
              response([
                { data: { search: { issueCount: 1, nodes: [{ ...record, headRefOid: head }] } } },
              ]),
            )
          : request(operation, repository, accountId, number),
      );
    const app = render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).inboxSeen[`7:${repo}`],
      ).toHaveLength(1),
    );
    expect(screen.queryByText('PR #1042 有新动态')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^收件箱/ }));
    fireEvent.click(screen.getByRole('button', { name: '标记已读' }));
    expect(screen.getByRole('tab', { name: '未读 0' })).toBeTruthy();
    head = 'changed-head';
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('PR #1042 有新动态')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '未读 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭消息提醒' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '刷新' }).hasAttribute('disabled')).toBe(false),
    );
    expect(screen.queryByText('PR #1042 有新动态')).toBeNull();
    app.unmount();
    render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '刷新' }).hasAttribute('disabled')).toBe(false),
    );
    expect(screen.queryByText('PR #1042 有新动态')).toBeNull();
  });
  it('keeps repository access failures in the picker without losing the current page', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.select).mockRejectedValue('GH_NOT_FOUND');
    render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: '仓库与同步' }));
    fireEvent.click(screen.getByRole('button', { name: '选择仓库' }));
    await screen.findByRole('radio', { name: /owner\/other/ });
    fireEvent.change(screen.getByRole('textbox', { name: '搜索仓库' }), {
      target: { value: 'not-a-repository' },
    });
    expect(screen.getByRole('button', { name: '打开仓库' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索仓库' }), {
      target: { value: 'owner/missing' },
    });
    fireEvent.click(screen.getByRole('button', { name: '打开仓库' }));
    expect((await screen.findByRole('alert')).textContent).toContain('找不到此仓库或记录');
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
      expect.stringContaining('检查 GitHub App 的仓库授权'),
    );
    expect(screen.queryByRole('heading', { name: '当前筛选下没有 PR' })).toBeNull();
    gateway.request = request;
    fireEvent.click(screen.getByRole('button', { name: '重试同步' }));
    await screen.findByRole('textbox', { name: '搜索 PR' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('shows authored synchronization failures in the unified inbox', async () => {
    const gateway = createGateway();
    const request = gateway.request;
    gateway.request = vi
      .fn()
      .mockImplementation((operation, repository, accountId, number) =>
        operation === 'authored'
          ? Promise.reject('GH_AUTHORED_UNAVAILABLE')
          : request(operation, repository, accountId, number),
      );
    render(<App gateway={gateway} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /^收件箱/ }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('GitHub 操作暂时未完成，请稍后重试。'),
    );
  });
  it('keeps the current settings section when repository selection is cancelled', async () => {
    render(<App gateway={createGateway()} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: '仓库与同步' }));
    fireEvent.click(screen.getByRole('button', { name: '选择仓库' }));
    fireEvent.click(await screen.findByRole('button', { name: '关闭弹窗' }));
    expect(screen.getByRole('heading', { name: '仓库与同步', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '搜索 PR' })).toBeNull();
  });
  it.each(['rejection', 'stale response'])(
    'explains sync failures from a %s and retries the failed read',
    async (failure) => {
      const gateway = createGateway();
      render(<App gateway={gateway} />);
      await screen.findByRole('textbox', { name: '搜索 PR' });
      const request = gateway.request;
      gateway.request = vi
        .fn()
        .mockImplementation((operation, repository, accountId, number) =>
          operation === 'authored'
            ? failure === 'rejection'
              ? Promise.reject(new Error('GH_REQUEST_FAILED: internal detail'))
              : Promise.resolve({ ...response([]), stale: true, error: 'GH_REQUEST_FAILED' })
            : request(operation, repository, accountId, number),
        );
      fireEvent.click(screen.getByRole('button', { name: '刷新' }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('暂时无法连接 GitHub，请检查网络后重试。');
      expect(alert.textContent).not.toMatch(/GH_|Error:|internal detail/);
      gateway.request = request;
      fireEvent.click(within(alert).getByRole('button', { name: '重试同步' }));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    },
  );
  it('shows actual login failures without displaying sample records', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValue('GH_NOT_FOUND');
    render(<App gateway={gateway} />);
    expect((await screen.findByRole('alert')).textContent).toContain('找不到此仓库或记录');
    expect(screen.queryByRole('textbox', { name: '搜索 PR' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '登录 GitHub' }));
    await waitFor(() => expect(gateway.login).toHaveBeenCalledOnce());
  });
  it('offers local recovery for a damaged credential and allows signing in afterward', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session)
      .mockRejectedValueOnce('GH_VAULT_INVALID: damaged')
      .mockResolvedValue({ user, selected: null });
    vi.mocked(gateway.login).mockResolvedValue({
      status: 'complete',
      code: null,
      verificationUrl: null,
      error: null,
    });
    render(<App gateway={gateway} />);
    expect((await screen.findByRole('alert')).textContent).toContain('本机保存的登录信息无法读取');
    expect(gateway.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '清除本机登录并重新授权' }));
    await waitFor(() => expect(gateway.logout).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('button', { name: '清除本机登录并重新授权' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '登录 GitHub' }));
    expect(await screen.findByRole('dialog', { name: '选择仓库' })).toBeTruthy();
  });
  it('keeps recovery available and reports an error if clearing local credentials fails', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.session).mockRejectedValue('GH_SECURE_STORAGE: unavailable');
    vi.mocked(gateway.logout).mockRejectedValue('GH_VAULT_IO: cannot clear');
    render(<App gateway={gateway} />);
    const reset = await screen.findByRole('button', { name: '清除本机登录并重新授权' });
    fireEvent.click(reset);
    await waitFor(() => expect(gateway.logout).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('无法清除本机登录'),
    );
    expect(screen.getByRole('alert').textContent).not.toMatch(/GH_|Error:/);
    expect(screen.getByRole('button', { name: '清除本机登录并重新授权' })).toBeTruthy();
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
    const login = await screen.findByRole('button', { name: '登录 GitHub' });
    await waitFor(() => expect((login as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(login);
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
    await screen.findByRole('radio', { name: /owner\/other.*私有/ });
    fireEvent.change(screen.getByRole('textbox', { name: '搜索仓库' }), {
      target: { value: 'owner/other' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /owner\/other.*私有/ }));
    expect(screen.getByRole('textbox', { name: '搜索仓库' })).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: '打开仓库' }));
    await waitFor(() => expect(gateway.select).toHaveBeenCalledWith('owner/other', user.id));
    await screen.findByRole('textbox', { name: '搜索 PR' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('persists explicit local read and unread choices after reopening', async () => {
    const gateway = createGateway();
    const app = render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: /^收件箱/ }));
    fireEvent.click(screen.getAllByRole('button', { name: '标记已读' })[0]);
    fireEvent.click(screen.getByRole('tab', { name: '全部' }));
    fireEvent.click(screen.getByRole('button', { name: '标记未读' }));
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).unread).toContain(
        activityFromGitHub(record, user.id, repo, user.login).id,
      ),
    );
    app.unmount();
    render(<App gateway={gateway} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: /^收件箱/ }));
    expect(await screen.findByRole('tab', { name: '未读 4' })).toBeTruthy();
  });
  it('keeps PR search when returning from the detail view', async () => {
    render(<App gateway={createGateway()} />);
    const search = await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.change(search, { target: { value: '1042' } });
    expect(screen.queryByRole('button', { name: /Correct source location reporting/ })).toBeNull();
    const content = screen.getByRole('main');
    content.scrollTop = 320;
    fireEvent.doubleClick(screen.getByRole('button', { name: /#1042/ }));
    expect(content.scrollTop).toBe(0);
    await screen.findByRole('heading', { name: '讨论 1' });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: '← 返回列表' }));
    expect(content.scrollTop).toBe(320);
    expect((screen.getByRole('textbox', { name: '搜索 PR' }) as HTMLInputElement).value).toBe(
      '1042',
    );
  });
  it('keeps the inbox badge and read filter consistent across pages', async () => {
    render(<App gateway={createGateway()} />);
    fireEvent.click(await screen.findByRole('button', { name: /#1042/ }));
    fireEvent.click(screen.getByRole('button', { name: '标记已读' }));
    fireEvent.click(await screen.findByRole('button', { name: /收件箱\s*3/ }));
    expect(screen.getByRole('tab', { name: '未读 3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /PR #1042.*未读/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '全部' }));
    expect(screen.getByRole('button', { name: /PR #1042.*已读/ })).toBeTruthy();
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).read).toContain(
        activityFromGitHub(record, user.id, repo, user.login).id,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '标记未读' }));
    fireEvent.click(screen.getByRole('button', { name: /^我发起的/ }));
    fireEvent.click(await screen.findByRole('button', { name: /#1042/ }));
    expect(screen.getByRole('button', { name: '标记已读' })).toBeTruthy();
  });
  it('restores saved theme preferences after reopening the interface', async () => {
    const app = render(<App gateway={createGateway()} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: '外观' }));
    fireEvent.click(await screen.findByRole('button', { name: '浅色' }));
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).preferences.theme,
      ).toBe('light'),
    );
    app.unmount();
    render(<App gateway={createGateway()} />);
    await screen.findByRole('textbox', { name: '搜索 PR' });
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: '外观' }));
    expect(screen.getByRole('button', { name: '浅色' }).getAttribute('aria-pressed')).toBe('true');
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

it('requires a selected repository before requesting profile statistics', async () => {
  const gateway = createGateway();
  gateway.session = vi.fn().mockResolvedValue({
    user: { ...user, avatar_url: 'https://avatars.githubusercontent.com/u/7' },
    selected: null,
  });
  gateway.request = vi.fn().mockRejectedValue(new Error('GH_TIMEOUT'));
  render(<App gateway={gateway} />);
  await screen.findByRole('button', { name: '个人主页' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '账号与连接设置' }).textContent).toContain(
      user.login,
    ),
  );
  expect(gateway.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '个人主页' }));
  expect(screen.queryByRole('heading', { name: '个人主页' })).toBeNull();
  expect(gateway.request).not.toHaveBeenCalled();
});
it('requests profile lazily using the selected repository', async () => {
  const gateway = createGateway();
  const request = gateway.request;
  gateway.request = vi
    .fn()
    .mockImplementation((operation, repository, accountId, number, head) =>
      operation === 'profile'
        ? Promise.reject(new Error('GH_TIMEOUT'))
        : request(operation, repository, accountId, number, head),
    );
  render(<App gateway={gateway} />);
  await screen.findByRole('textbox', { name: '搜索 PR' });
  expect(vi.mocked(gateway.request).mock.calls.some((call) => call[0] === 'profile')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '个人主页' }));
  await screen.findByRole('heading', { name: '个人主页' });
  await waitFor(() =>
    expect(gateway.request).toHaveBeenCalledWith(
      'profile',
      repo,
      7,
      new Date().getUTCFullYear(),
      '',
    ),
  );
  expect(screen.getByRole('heading', { name: '个人主页' })).toBeTruthy();
});

it('keeps the cached-session connection error visible on profile and settings until a successful refresh', async () => {
  const gateway = createGateway();
  const original = gateway.request;
  gateway.cachedSession = vi.fn().mockResolvedValue({ user, selected: repo });
  gateway.cached = vi.fn().mockImplementation(async (...args: Parameters<typeof original>) => ({
    ...(await original(...args)),
    fetchedAt: Date.now(),
  }));
  gateway.session = vi.fn().mockRejectedValue('GH_TIMEOUT');
  render(<App gateway={gateway} />);
  await screen.findByText('GitHub 响应超时，请稍后重试。');
  fireEvent.click(screen.getByRole('button', { name: '个人主页' }));
  await screen.findByRole('heading', { name: '个人主页' });
  expect(screen.getByText('GitHub 响应超时，请稍后重试。')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  expect(screen.getByText('GitHub 响应超时，请稍后重试。')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '重试同步' }));
  await waitFor(() => expect(screen.queryByText('GitHub 响应超时，请稍后重试。')).toBeNull());
});

it('recovers a local read failure in place without writing defaults over saved preferences', async () => {
  window.localStorage.setItem(
    'threadline.workspace.v1',
    JSON.stringify({ preferences: { density: 'compact' } }),
  );
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
    throw new Error('temporary read failure');
  });
  try {
    render(<App gateway={createGateway()} />);
    const retry = await screen.findByRole('button', { name: '重试读取' });
    expect(screen.getByRole('alert').textContent).toContain('无法读取本地数据');
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: '重试读取' })).toBeNull());
    expect(document.querySelector('.density-compact')).not.toBeNull();
  } finally {
    get.mockRestore();
  }
});

it('retains edited preferences after save failure and saves them on retry', async () => {
  render(<App gateway={createGateway()} />);
  await screen.findByRole('textbox', { name: '搜索 PR' });
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '外观' }));
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  try {
    fireEvent.change(screen.getByRole('combobox', { name: '信息密度' }), {
      target: { value: 'compact' },
    });
    const retry = await screen.findByRole('button', { name: '重试保存' });
    expect((screen.getByRole('combobox', { name: '信息密度' }) as HTMLSelectElement).value).toBe(
      'compact',
    );
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: '重试保存' })).toBeNull());
    expect(
      JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!).preferences.density,
    ).toBe('compact');
  } finally {
    save.mockRestore();
  }
});
