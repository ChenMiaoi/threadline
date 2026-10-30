// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDesktopLifecycle } from './useDesktopLifecycle';

const host = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('./desktop', () => host);
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  host.isDesktop = true;
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(listen).mockResolvedValue(vi.fn());
});
afterEach(cleanup);

async function requestQuit() {
  await act(async () =>
    vi.mocked(listen).mock.calls.at(-1)![1]({
      event: 'desktop-quit-requested',
      id: 1,
      payload: null,
    }),
  );
}
const exits = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === 'complete_quit');

describe('desktop background lifecycle', () => {
  it('uses the same save-before-exit path for the settings quit action', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(() => useDesktopLifecycle(flush, 'Open', 'Quit'));
    await act(async () => hook.result.current.quit());
    expect(flush).toHaveBeenCalledOnce();
    expect(exits()).toHaveLength(1);
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(invoke).mock.invocationCallOrder[
        vi.mocked(invoke).mock.calls.findIndex(([command]) => command === 'complete_quit')
      ],
    );
  });
  it('does not register desktop events in the browser', () => {
    host.isDesktop = false;
    renderHook(() => useDesktopLifecycle(vi.fn(), 'Open', 'Quit'));
    expect(listen).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('waits for saving before exiting and coalesces repeated quit requests', async () => {
    let finish!: () => void;
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => useDesktopLifecycle(flush, 'Open', 'Quit'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('set_desktop_menu', { open: 'Open', quit: 'Quit' }),
    );
    await requestQuit();
    await requestQuit();
    expect(flush).toHaveBeenCalledOnce();
    expect(exits()).toHaveLength(0);
    await act(async () => finish());
    expect(exits()).toHaveLength(1);
  });

  it('keeps the process alive after save failure and allows retry from the tray', async () => {
    const flush = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    const hook = renderHook(() => useDesktopLifecycle(flush, 'Open', 'Quit'));
    await requestQuit();
    expect(exits()).toHaveLength(0);
    expect(hook.result.current.error).toEqual({ message: 'Error: disk full', quitting: true });
    expect(invoke).toHaveBeenCalledWith('show_main_window');
    await requestQuit();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(exits()).toHaveLength(1);
    expect(hook.result.current.error.message).toBe('');
  });

  it('uses current workspace state and refreshes native labels after a language change', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const latest = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(({ flush, open, quit }) => useDesktopLifecycle(flush, open, quit), {
      initialProps: { flush: first, open: 'Open', quit: 'Quit' },
    });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('set_desktop_menu', { open: 'Open', quit: 'Quit' }),
    );
    hook.rerender({ flush: latest, open: '打开', quit: '退出' });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('set_desktop_menu', { open: '打开', quit: '退出' }),
    );
    await requestQuit();
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(exits()).toHaveLength(1);
  });

  it('releases a listener arriving after unmount without enabling the quit menu', async () => {
    let finish!: (stop: () => void) => void;
    const stop = vi.fn();
    vi.mocked(listen).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const hook = renderHook(() => useDesktopLifecycle(vi.fn(), 'Open', 'Quit'));
    hook.unmount();
    await act(async () => finish(stop));
    expect(stop).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports listener setup failures without enabling an unusable quit menu', async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error('event unavailable'));
    const hook = renderHook(() => useDesktopLifecycle(vi.fn(), 'Open', 'Quit'));
    await waitFor(() =>
      expect(hook.result.current.error).toEqual({
        message: 'Error: event unavailable',
        quitting: false,
      }),
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});
