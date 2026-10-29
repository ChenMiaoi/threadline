import { useEffect, useRef, useState } from 'react';
import type { GitHubWorkspace } from '../../lib/useGitHub';
import { Modal } from '../../components/Modal';

export function GitHubLoginButton({ github }: { github: GitHubWorkspace }) {
  return (
    <>
      <button
        className="chip accent"
        disabled={github.connecting || github.auth.busy}
        onClick={() => void github.auth.start()}
      >
        {github.session ? '重新授权 GitHub' : '登录 GitHub'}
      </button>
      {github.auth.state.status === 'cancelled' && github.auth.state.error && (
        <p role="alert" className="yellow">
          {github.auth.state.error}
        </p>
      )}
    </>
  );
}

export function GitHubLoginDialog({ github }: { github: GitHubWorkspace }) {
  const [copyMessage, setCopyMessage] = useState('');
  const [openError, setOpenError] = useState('');
  const openedCode = useRef<string | null>(null);
  const { state, busy, start, cancel } = github.auth;
  useEffect(() => {
    if (!state.code || !state.verificationUrl || openedCode.current === state.code) return;
    const timer = window.setTimeout(() => {
      openedCode.current = state.code;
      void github.gateway
        .open(state.verificationUrl!)
        .catch(() => setOpenError('无法自动打开浏览器，请重试，或访问 github.com/login/device。'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [github.gateway, state.code, state.verificationUrl]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(state.code!);
      setCopyMessage('验证码已复制');
    } catch {
      setCopyMessage('无法自动复制，请手动选择并复制上方验证码。');
    }
  }
  return (
    <Modal title="登录 GitHub" onClose={() => void cancel()}>
      <section className="github-device-login" aria-label="GitHub 授权">
        {busy ? (
          <>
            {state.code ? (
              <>
                <p>已为你打开 GitHub 授权页。请在该页面输入验证码并确认授权。</p>
                <div className="device-code" aria-label="GitHub 验证码">
                  {state.code}
                </div>
                <div className="inline-group">
                  <button className="chip accent" onClick={() => void copyCode()}>
                    复制验证码
                  </button>
                  <button
                    className="chip"
                    onClick={() => {
                      setOpenError('');
                      void github.gateway
                        .open(state.verificationUrl!)
                        .catch(() =>
                          setOpenError('无法打开浏览器，请手动访问 github.com/login/device。'),
                        );
                    }}
                  >
                    重新打开授权页 ↗
                  </button>
                </div>
              </>
            ) : (
              <p>正在准备 GitHub 授权页面…</p>
            )}
            <p className="muted" role="status">
              {state.code ? '等待授权完成，完成后会自动连接。' : '正在获取验证码…'}
            </p>
          </>
        ) : (
          <button
            className="chip accent"
            onClick={() => {
              setCopyMessage('');
              setOpenError('');
              void start();
            }}
          >
            重试登录
          </button>
        )}
        {state.error && (
          <p role="alert" className="yellow">
            {state.error}
          </p>
        )}
        {openError && (
          <p role="alert" className="yellow">
            {openError}
          </p>
        )}
        {copyMessage && <p role="status">{copyMessage}</p>}
        <p className="dim">授权在 GitHub 官方页面确认。你可以返回此窗口查看状态。</p>
        <button className="chip" onClick={() => void cancel()}>
          取消登录
        </button>
      </section>
    </Modal>
  );
}
