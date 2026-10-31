// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemePicker } from './ThemePicker';
import { defaultWorkspace } from '../../core/workspace';
import { colorThemes } from '../../core/themes';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Harness() {
  const [preferences, setPreferences] = useState(defaultWorkspace().preferences);
  return (
    <ThemePicker
      preferences={preferences}
      onChange={(change) => setPreferences((current) => ({ ...current, ...change }))}
    />
  );
}

it('selects every theme without resetting the selected mode or gradient option', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '浅色' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '柔和渐变' }));
  const gallery = screen.getByRole('group', { name: '色彩主题' });
  for (const theme of colorThemes) {
    const button = within(gallery).getByRole('button', { name: theme.name });
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(
      within(gallery)
        .getAllByRole('button')
        .filter((item) => item.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
    const preview = button.querySelector<HTMLElement>('.theme-miniature')!;
    expect(preview.style.getPropertyValue('--surface')).toBe(theme.light.surface);
    expect(preview.style.getPropertyValue('--content-bg')).toBe(theme.light.canvas);
    if (theme.variants) {
      expect(button.querySelector('.theme-variant')?.textContent).toBe(theme.variants.light);
    }
  }
  expect(screen.getByRole('button', { name: '浅色' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('checkbox', { name: '柔和渐变' })).toHaveProperty('checked', false);
});

it('updates all previews when system appearance changes and releases its subscription', () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => media);
  const view = render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '跟随系统' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nord' }));
  const preview = screen
    .getByRole('button', { name: 'Nord' })
    .querySelector<HTMLElement>('.theme-miniature')!;
  expect(preview.style.getPropertyValue('--surface')).toBe('#3b4252');
  act(() => {
    media.matches = true;
    listeners.forEach((listener) => listener());
  });
  expect(preview.style.getPropertyValue('--surface')).toBe('#e5e9f0');
  view.unmount();
  expect(listeners.size).toBe(0);
});
