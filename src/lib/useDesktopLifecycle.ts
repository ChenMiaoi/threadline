import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktop } from './desktop';

export function useDesktopLifecycle(flush: () => Promise<void>, open: string, quit: string) {
  const [error, setError] = useState({ message: '', quitting: false });
  const busy = useRef(false);
  async function quitApplication() {
    if (busy.current) return;
    busy.current = true;
    setError({ message: '', quitting: false });
    try {
      await flush();
      await invoke('complete_quit');
    } catch (reason) {
      setError({ message: String(reason), quitting: true });
      // Saving failures must be visible even when Quit was selected from a hidden window.
      await invoke('show_main_window').catch(() => undefined);
    } finally {
      busy.current = false;
    }
  }
  const finishQuit = useEffectEvent(quitApplication);
  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen('desktop-quit-requested', () => {
      if (!disposed) void finishQuit();
    })
      .then(async (stop) => {
        if (disposed) return stop();
        unlisten = stop;
        await invoke('set_desktop_menu', { open, quit });
      })
      .catch((reason) => {
        if (!disposed) setError({ message: String(reason), quitting: false });
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open, quit]);
  return { error, quit: quitApplication };
}
