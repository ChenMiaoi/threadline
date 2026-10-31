// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useUpdates } from '../../lib/useUpdates';
import { UpdatesPanel } from './UpdatesPanel';
afterEach(cleanup);
it('shows version information without an update action in unsupported builds', async () => {
  const gateway = {
    info: async () => ({ version: '0.1.0', channel: '浏览器预览', enabled: false }),
    check: vi.fn().mockResolvedValue(null),
    restart: vi.fn().mockResolvedValue(undefined),
  };
  function Harness() {
    return <UpdatesPanel updates={useUpdates(false, gateway)} flush={vi.fn()} />;
  }
  render(<Harness />);
  await screen.findByText('此构建未启用自动更新。');
  expect(screen.getByText('ThreadLine 0.1.0')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '检查更新' })).toBeNull();
  expect(gateway.check).not.toHaveBeenCalled();
});
it('checks, downloads, and requires an explicit install action in the UI', async () => {
  const update = {
    version: '0.2.0',
    body: '## Release notes\n\n- Improved navigation',
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    info: async () => ({ version: '0.1.0', channel: '正式版', enabled: true }),
    check: vi.fn().mockResolvedValue(update),
    restart: vi.fn().mockResolvedValue(undefined),
  };
  const flush = vi.fn().mockResolvedValue(undefined);
  function Harness() {
    return <UpdatesPanel updates={useUpdates(false, gateway)} flush={flush} />;
  }
  render(<Harness />);
  await screen.findByText('ThreadLine 0.1.0');
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  const download = await screen.findByRole('button', { name: '下载更新' });
  expect(
    screen.getByText('发现新版本 0.2.0').closest('[role="status"]')?.getAttribute('role'),
  ).toBe('status');
  fireEvent.click(screen.getByText('更新说明'));
  expect(await screen.findByRole('heading', { name: 'Release notes' })).toBeTruthy();
  expect(screen.getByText('Improved navigation')).toBeTruthy();
  fireEvent.click(download);
  const install = await screen.findByRole('button', { name: '安装并重新启动' });
  expect(update.install).not.toHaveBeenCalled();
  fireEvent.click(install);
  await waitFor(() => expect(gateway.restart).toHaveBeenCalledOnce());
  expect(flush).toHaveBeenCalledOnce();
});
