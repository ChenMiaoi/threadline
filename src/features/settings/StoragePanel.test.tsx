// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoragePanel } from './StoragePanel';
import { clearCache, loadStorageUsage } from '../../lib/storage';
const host = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('../../lib/desktop', () => host);
vi.mock('../../lib/storage', async (original) => ({
  ...(await original<typeof import('../../lib/storage')>()),
  loadStorageUsage: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
}));
const usage = {
  programBytes: 1024,
  programAvailable: true,
  dataBytes: 2048,
  runtimeBytes: 0,
  webCacheClearable: false,
  cacheBytes: 1024,
  totalBytes: 4096,
  incomplete: false,
};
beforeEach(() => {
  host.isDesktop = true;
  vi.mocked(loadStorageUsage).mockReset().mockResolvedValue(usage);
});
afterEach(cleanup);
it('shows measured categories and refreshes the total without accumulating old results', async () => {
  render(<StoragePanel />);
  await screen.findByText('4 KiB');
  expect(screen.getByText('程序文件')).toBeTruthy();
  expect(screen.getByText('本地数据')).toBeTruthy();
  expect(screen.getByText('缓存')).toBeTruthy();
  vi.mocked(loadStorageUsage).mockResolvedValue({ ...usage, dataBytes: 4096, totalBytes: 6144 });
  fireEvent.click(screen.getByRole('button', { name: '刷新磁盘占用' }));
  await screen.findByText('6 KiB');
  expect(screen.queryByText('4 KiB', { selector: 'strong' })).toBeNull();
});
it('reports failures, allows retry, and identifies partial measurements', async () => {
  vi.mocked(loadStorageUsage).mockRejectedValueOnce(new Error('STORAGE_PATH_FAILED'));
  render(<StoragePanel />);
  await screen.findByRole('alert');
  vi.mocked(loadStorageUsage).mockResolvedValue({ ...usage, incomplete: true });
  fireEvent.click(screen.getByRole('button', { name: '刷新磁盘占用' }));
  await screen.findByText('部分文件无法读取，当前显示已统计的占用。');
  await waitFor(() => expect(screen.queryByText('无法读取磁盘占用，请重试。')).toBeNull());
  expect(screen.getByRole('alert').textContent).toContain('部分文件无法读取');
});
it('includes the local desktop build alongside separate browser estimates', async () => {
  host.isDesktop = false;
  vi.mocked(loadStorageUsage).mockResolvedValue({ ...usage, browserBytes: 1024 });
  render(<StoragePanel />);
  await screen.findByText('浏览器存储（估算）');
  expect(screen.getByText('程序文件')).toBeTruthy();
  expect(screen.getByText('5 KiB')).toBeTruthy();
  expect(screen.queryByText('仅统计本地预览数据，不含开发构建。')).toBeNull();
});

it('clears only the selected category and then refreshes measurements', async () => {
  vi.mocked(loadStorageUsage).mockResolvedValue({
    ...usage,
    webCacheClearable: true,
    runtimeBytes: 2048,
  });
  render(<StoragePanel />);
  await screen.findByText('运行组件');
  const calls = vi.mocked(loadStorageUsage).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '清理页面资源' }));
  await waitFor(() => expect(clearCache).toHaveBeenCalledWith('web-resources'));
  await waitFor(() => expect(loadStorageUsage).toHaveBeenCalledTimes(calls + 1));
});
