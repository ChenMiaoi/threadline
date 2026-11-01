// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GitHubConnection } from './GitHubConnection';
import { useGitHub } from '../../lib/useGitHub';
import { createGateway } from '../../test/github.fixture';

afterEach(cleanup);

it('offers an explicit workspace entry only after an account and repository are connected', async () => {
  const { result } = renderHook(() => useGitHub(0, createGateway()));
  await waitFor(() => expect(result.current.session).not.toBeNull());
  const onEnter = vi.fn();
  const onChoose = vi.fn();
  const { rerender } = render(
    <GitHubConnection github={result.current} onChoose={onChoose} onEnter={onEnter} />,
  );
  fireEvent.click(screen.getByRole('button', { name: '进入工作区' }));
  expect(onEnter).toHaveBeenCalledTimes(1);
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '切换仓库' }));
  expect(onChoose).toHaveBeenCalledTimes(1);
  rerender(
    <GitHubConnection
      github={{ ...result.current, repo: '' }}
      onChoose={onChoose}
      onEnter={onEnter}
    />,
  );
  expect(screen.queryByRole('button', { name: '进入工作区' })).toBeNull();
  expect(screen.getByRole('button', { name: '选择仓库' })).toBeTruthy();
});
