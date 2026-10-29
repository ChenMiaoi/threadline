// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowControls } from './WindowControls';

const windowApi = vi.hoisted(() => ({
  isMaximized: vi.fn(),
  onResized: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
}));
const desktop = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('../lib/desktop', () => desktop);
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => windowApi }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  desktop.isDesktop = true;
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.onResized.mockResolvedValue(vi.fn());
  windowApi.minimize.mockResolvedValue(undefined);
  windowApi.toggleMaximize.mockResolvedValue(undefined);
  windowApi.close.mockResolvedValue(undefined);
});

describe('desktop window controls', () => {
  it('invokes each native window action and updates the restore label after resizing', async () => {
    render(<WindowControls />);
    await waitFor(() => expect(windowApi.onResized).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '最小化窗口' }));
    fireEvent.click(screen.getByRole('button', { name: '最大化窗口' }));
    expect(windowApi.minimize).toHaveBeenCalledOnce();
    expect(windowApi.toggleMaximize).toHaveBeenCalledOnce();
    windowApi.isMaximized.mockResolvedValue(true);
    await act(async () => windowApi.onResized.mock.calls[0][0]());
    expect(screen.getByRole('button', { name: '还原窗口' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }));
    expect(windowApi.close).toHaveBeenCalledOnce();
  });

  it('keeps window action failures visible and allows retry', async () => {
    windowApi.close.mockRejectedValueOnce(new Error('IPC unavailable'));
    render(<WindowControls />);
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }));
    expect((await screen.findByRole('alert')).textContent).toContain('请重试');
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('releases a resize listener that resolves after unmount', async () => {
    const unlisten = vi.fn();
    let resolveListener!: (listener: () => void) => void;
    windowApi.onResized.mockReturnValue(
      new Promise((resolve) => {
        resolveListener = resolve;
      }),
    );
    const view = render(<WindowControls />);
    view.unmount();
    await act(async () => resolveListener(unlisten));
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('omits desktop actions in browser previews', () => {
    desktop.isDesktop = false;
    render(<WindowControls />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(windowApi.onResized).not.toHaveBeenCalled();
  });
});
