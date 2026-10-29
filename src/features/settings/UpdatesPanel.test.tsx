// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useUpdates } from '../../lib/useUpdates';
import { UpdatesPanel } from './UpdatesPanel';
afterEach(cleanup);
it('checks, downloads, and requires an explicit install action in the UI', async () => {
  const update = {
    version: '0.2.0',
    body: 'Release notes',
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
  fireEvent.click(await screen.findByRole('button', { name: '下载更新' }));
  const install = await screen.findByRole('button', { name: '安装并重新启动' });
  expect(update.install).not.toHaveBeenCalled();
  fireEvent.click(install);
  await waitFor(() => expect(gateway.restart).toHaveBeenCalledOnce());
  expect(flush).toHaveBeenCalledOnce();
});
