// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
