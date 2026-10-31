// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from './WorkspaceShell';
import { loadGitHubAvatar } from '../lib/avatar-cache';

vi.mock('../lib/avatar-cache', async (original) => ({
  ...(await original<typeof import('../lib/avatar-cache')>()),
  loadGitHubAvatar: vi.fn().mockResolvedValue(null),
}));

const desktop = vi.hoisted(() => ({ isDesktop: true, isMacOS: false }));
vi.mock('../lib/desktop', () => desktop);
vi.mock('./WindowControls', () => ({ WindowControls: () => null }));

afterEach(cleanup);
beforeEach(() => {
  desktop.isDesktop = true;
  desktop.isMacOS = false;
});

function renderShell(onNavigate = vi.fn(), onChooseRepository = vi.fn(), onSearch = vi.fn()) {
  return render(
    <WorkspaceShell
      view="inbox"
      unread={0}
      notificationsAvailable={true}
      onNavigate={onNavigate}
      onSearch={onSearch}
      loading={false}
      repo="owner/repo"
      repositoryAvatarUrl="https://avatars.githubusercontent.com/u/1714999?v=4"
      counts={{ review: 0, issues: 0 }}
      onChooseRepository={onChooseRepository}
    >
      Workspace
    </WorkspaceShell>,
  );
}

describe('platform titlebar dragging', () => {
  it('keeps the custom desktop header draggable on Windows and Linux', () => {
    const { container } = renderShell();
    expect(container.querySelector('header')?.hasAttribute('data-tauri-drag-region')).toBe(true);
    expect(within(screen.getByRole('complementary')).getByText('ThreadLine')).toBeTruthy();
    expect(container.querySelector('header .brand')).toBeNull();
  });

  it('makes the integrated macOS header draggable while keeping its actions interactive', () => {
    desktop.isMacOS = true;
    const { container } = renderShell();
    expect(container.querySelector('header')?.hasAttribute('data-tauri-drag-region')).toBe(true);
    expect(within(screen.getByRole('complementary')).getByText('ThreadLine')).toBeTruthy();
    expect(container.querySelector('header .brand')).toBeNull();
    for (const button of container.querySelectorAll('header button')) {
      expect(button.hasAttribute('data-tauri-drag-region')).toBe(false);
    }
    expect(container.querySelector('.macos-app-bar')).toBeTruthy();
  });

  it('does not send window drag actions from browser previews', () => {
    desktop.isDesktop = false;
    const { container } = renderShell();
    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull();
  });
});

it('names the global search entry for its authored PR scope', () => {
  renderShell();
  expect(screen.getByRole('button', { name: '搜索我发起的 PR' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '搜索工作区' })).toBeNull();
});

it('keeps workspace navigation in the sidebar without a duplicate header menu', () => {
  const { container } = renderShell();
  expect(container.querySelector('header details')).toBeNull();
  expect(screen.getByRole('button', { name: '查看稍后处理' })).toBeTruthy();
});

it('opens the current repository from its name and reserves adding for the plus button', () => {
  const navigate = vi.fn();
  const choose = vi.fn();
  renderShell(navigate, choose);
  const sidebar = within(screen.getByRole('complementary'));
  fireEvent.click(sidebar.getByRole('button', { name: 'owner/repo' }));
  expect(navigate).toHaveBeenCalledWith('authored');
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(sidebar.getByRole('button', { name: '添加仓库' }));
  expect(choose).toHaveBeenCalledOnce();
});

it('shows the repository and its owner separately with the owner avatar', async () => {
  renderShell();
  const repository = within(screen.getByRole('complementary')).getByRole('button', {
    name: 'owner/repo',
  });
  expect(within(repository).getByText('repo')).toBeTruthy();
  expect(within(repository).getByText('owner')).toBeTruthy();
  const image = await within(repository).findByRole('img', { name: 'owner 的头像' });
  expect(image.getAttribute('src')).toBe('https://avatars.githubusercontent.com/u/1714999?v=4');
  expect(loadGitHubAvatar).toHaveBeenCalledWith(
    'https://avatars.githubusercontent.com/u/1714999?v=4',
  );
});

it('keeps the grouped header search and repository switcher interactive', () => {
  desktop.isMacOS = true;
  const choose = vi.fn();
  const search = vi.fn();
  const { container } = renderShell(vi.fn(), choose, search);
  const header = within(container.querySelector('header')!);
  fireEvent.click(header.getByRole('button', { name: '搜索我发起的 PR' }));
  expect(search).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(header.getByRole('button', { name: 'owner/repo' }));
  expect(choose).toHaveBeenCalledOnce();
});

it('keeps the brand icon and name in the sidebar, separate from the window controls', () => {
  desktop.isMacOS = true;
  const { container } = renderShell();
  const brand = container.querySelector('aside .brand');
  expect(brand?.querySelector('.icon-brand')).toBeTruthy();
  expect(brand?.textContent).toBe('ThreadLine');
  expect(container.querySelector('header .brand')).toBeNull();
});
