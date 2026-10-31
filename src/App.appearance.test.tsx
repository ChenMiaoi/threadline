// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { createGateway } from './test/github.fixture';
import { colorThemes, getColorTheme } from './core/themes';
import { defaultWorkspace } from './core/workspace';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock('./lib/system-fonts', () => ({ loadSystemFonts: vi.fn().mockResolvedValue([]) }));

beforeAll(async () => {
  await import('./features/settings/AppearanceSettings');
});
beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('applies theme changes to the application and restores them after reopening', async () => {
  const first = render(<App gateway={createGateway()} />);
  await screen.findByText('Preserve leading-space flags');
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '外观' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Everforest' }));
  fireEvent.click(screen.getByRole('button', { name: '浅色' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '柔和渐变' }));
  const root = document.querySelector<HTMLElement>('.workspace-root')!;
  expect(root.dataset.colorTheme).toBe('everforest');
  expect(root.style.colorScheme).toBe('light');
  expect(root.style.getPropertyValue('--surface')).toBe(getColorTheme('everforest').light.surface);
  expect(root.style.getPropertyValue('--content-bg')).toBe(
    getColorTheme('everforest').light.canvas,
  );
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem('threadline.workspace.v1')!);
    expect(saved.preferences).toMatchObject({
      colorTheme: 'everforest',
      theme: 'light',
      themeGradient: false,
    });
  });
  first.unmount();
  render(<App gateway={createGateway()} />);
  await waitFor(() => {
    const restored = document.querySelector<HTMLElement>('.workspace-root')!;
    expect(restored.dataset.colorTheme).toBe('everforest');
    expect(restored.style.colorScheme).toBe('light');
    expect(restored.style.getPropertyValue('--content-bg')).toBe(
      getColorTheme('everforest').light.canvas,
    );
  });
});

it('updates the application and preview gallery together when system appearance changes', async () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => media);
  const workspace = defaultWorkspace();
  workspace.preferences = { ...workspace.preferences, theme: 'system', colorTheme: 'nord' };
  window.localStorage.setItem('threadline.workspace.v1', JSON.stringify(workspace));
  const view = render(<App gateway={createGateway()} />);
  await screen.findByText('Preserve leading-space flags');
  fireEvent.click(screen.getByRole('button', { name: '设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '外观' }));
  await screen.findByRole('button', { name: 'Nord' });
  act(() => {
    media.matches = true;
    listeners.forEach((listener) => listener());
  });
  expect(document.querySelector<HTMLElement>('.workspace-root')!.style.colorScheme).toBe('light');
  for (const theme of colorThemes) {
    const preview = screen
      .getByRole('button', { name: theme.name })
      .querySelector<HTMLElement>('.theme-miniature')!;
    expect(preview.style.getPropertyValue('--surface')).toBe(theme.light.surface);
  }
  view.unmount();
  expect(listeners.size).toBe(0);
});
