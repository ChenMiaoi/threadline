import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop, isMacDesktop } from '../lib/desktop';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isDesktop || isMacDesktop) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    const update = () => {
      void appWindow
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(value);
        })
        .catch(() => {
          if (!disposed) setError('无法读取窗口状态，请重新打开窗口。');
        });
    };
    update();
    const listener = appWindow.onResized(update).catch(() => {
      if (!disposed) setError('无法监听窗口状态，请重新打开窗口。');
      return () => {};
    });
    return () => {
      disposed = true;
      void listener.then((unlisten) => unlisten());
    };
  }, []);
  if (!isDesktop || isMacDesktop) return null;
  function run(action: 'minimize' | 'toggleMaximize' | 'close') {
    setError('');
    const appWindow = getCurrentWindow();
    void appWindow[action]().catch(() => setError('窗口操作未成功，请重试。'));
  }
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button aria-label="最小化窗口" title="最小化" onClick={() => run('minimize')}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1 6h10" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button
        aria-label={maximized ? '还原窗口' : '最大化窗口'}
        title={maximized ? '还原' : '最大化'}
        onClick={() => run('toggleMaximize')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          {maximized ? (
            <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" fill="none" stroke="currentColor" />
          ) : (
            <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" />
          )}
        </svg>
      </button>
      <button
        className="window-close"
        aria-label="关闭窗口"
        title="关闭"
        onClick={() => run('close')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m1 1 10 10M11 1 1 11" fill="none" stroke="currentColor" />
        </svg>
      </button>
      {error && (
        <span className="window-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
