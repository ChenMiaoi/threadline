import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitHubGateway, GitHubLoginState } from '../core/github';

const idle: GitHubLoginState = { status: 'idle', code: null, verificationUrl: null, error: null };
const pending = (state: GitHubLoginState) =>
  state.status === 'starting' || state.status === 'waiting';

export function useGitHubLogin(gateway: GitHubGateway, onAuthenticated: () => Promise<void>) {
  const [state, setState] = useState(idle);
  const generation = useRef(0);
  const active = useRef(false);
  const authenticated = useRef(onAuthenticated);
  useEffect(() => {
    authenticated.current = onAuthenticated;
  }, [onAuthenticated]);
  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    const token = ++generation.current;
    setState({ ...idle, status: 'starting' });
    try {
      const result = await gateway.login();
      if (token !== generation.current) return;
      active.current = pending(result);
      setState(result);
      if (result.status === 'complete') await authenticated.current();
    } catch (reason) {
      if (token !== generation.current) return;
      active.current = false;
      setState({ ...idle, status: 'error', error: String(reason) });
    }
  }, [gateway]);

  const cancel = useCallback(async () => {
    const token = ++generation.current;
    active.current = false;
    setState({ ...idle, status: 'cancelled' });
    try {
      await gateway.cancelLogin();
    } catch {
      if (token === generation.current)
        setState({
          ...idle,
          status: 'cancelled',
          error: '无法确认后台登录已停止，请重新打开应用后再试。',
        });
    }
  }, [gateway]);

  useEffect(() => {
    if (!pending(state)) return;
    const token = generation.current;
    let disposed = false;
    let delivered = false;
    const timer = window.setTimeout(() => {
      void gateway
        .loginStatus()
        .then(async (next) => {
          if (disposed || token !== generation.current) return;
          delivered = true;
          active.current = pending(next);
          setState(next);
          if (next.status === 'complete') await authenticated.current();
        })
        .catch((reason) => {
          if ((disposed && !delivered) || token !== generation.current) return;
          active.current = false;
          setState({ ...idle, status: 'error', error: String(reason) });
        });
    }, 1500);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [gateway, state]);

  useEffect(
    () => () => {
      ++generation.current;
      if (active.current) void gateway.cancelLogin().catch(() => {});
      active.current = false;
    },
    [gateway],
  );

  return { state, start, cancel, busy: pending(state) };
}
