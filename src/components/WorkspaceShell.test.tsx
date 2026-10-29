// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from './WorkspaceShell';

const desktop = vi.hoisted(() => ({ isDesktop: true, isMacDesktop: false }));
vi.mock('../lib/desktop', () => desktop);
vi.mock('./WindowControls', () => ({ WindowControls: () => null }));

afterEach(cleanup);
beforeEach(() => {
  desktop.isDesktop = true;
  desktop.isMacDesktop = false;
});

function renderShell() {
  return render(
    <WorkspaceShell
      view="inbox"
      unread={0}
      notificationsAvailable={true}
      onNavigate={vi.fn()}
      onSearch={vi.fn()}
      className=""
      loading={false}
      repo="owner/repo"
      counts={{ review: 0, issues: 0 }}
      onChooseRepository={vi.fn()}
    >
      Workspace
    </WorkspaceShell>,
  );
}

describe('platform titlebar dragging', () => {
  it('keeps the custom desktop header draggable on Windows and Linux', () => {
    const { container } = renderShell();
    expect(container.querySelector('header')?.hasAttribute('data-tauri-drag-region')).toBe(true);
    expect(screen.getByText('ThreadLine').hasAttribute('data-tauri-drag-region')).toBe(true);
  });

  it('leaves macOS dragging to the native titlebar', () => {
    desktop.isMacDesktop = true;
    const { container } = renderShell();
    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull();
    expect(container.querySelector('.macos-app-bar')).toBeTruthy();
  });

  it('does not send window drag actions from browser previews', () => {
    desktop.isDesktop = false;
    const { container } = renderShell();
    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull();
  });
});

it('closes the workspace menu with Escape and returns focus to its summary', () => {
  const { container } = renderShell();
  const menu = container.querySelector('details')!;
  const summary = menu.querySelector('summary')!;
  menu.open = true;
  screen.getByRole('button', { name: '工具收件箱' }).focus();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(menu.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});

it('consumes the outside pointer gesture without activating an underlying control', () => {
  const { container } = renderShell();
  const menu = container.querySelector('details')!;
  const outside = screen.getByRole('button', { name: '账号与连接设置' });
  const action = vi.fn();
  outside.addEventListener('click', action);
  menu.open = true;
  fireEvent.pointerDown(outside);
  fireEvent.pointerUp(outside);
  fireEvent.click(outside);
  expect(menu.open).toBe(false);
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(outside);
  expect(action).toHaveBeenCalledTimes(1);
});

it('consumes a keyboard-generated outside click while allowing menu item navigation', () => {
  const { container } = renderShell();
  const menu = container.querySelector('details')!;
  const outside = screen.getByRole('button', { name: '账号与连接设置' });
  const action = vi.fn();
  outside.addEventListener('click', action);
  menu.open = true;
  fireEvent.click(outside);
  expect(menu.open).toBe(false);
  expect(action).not.toHaveBeenCalled();
  menu.open = true;
  fireEvent.click(screen.getByRole('button', { name: '工具收件箱' }));
  expect(menu.open).toBe(false);
});

it('names the global search entry for its authored PR scope', () => {
  renderShell();
  expect(screen.getByRole('button', { name: '搜索我发起的 PR' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '搜索工作区' })).toBeNull();
});

it('restores menu focus on outside dismissal and releases a cancelled pointer gesture', () => {
  const { container } = renderShell();
  const menu = container.querySelector('details')!;
  const summary = menu.querySelector('summary')!;
  const outside = screen.getByRole('button', { name: '账号与连接设置' });
  const action = vi.fn();
  outside.addEventListener('click', action);
  menu.open = true;
  screen.getByRole('button', { name: '工具收件箱' }).focus();
  fireEvent.pointerDown(outside);
  expect(document.activeElement).toBe(summary);
  fireEvent.pointerCancel(outside);
  fireEvent.click(outside, { detail: 0 });
  expect(action).toHaveBeenCalledTimes(1);
});
