// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { createGateway } from './test/github.fixture';

const update = vi.hoisted(() => ({
  status: 'available',
  version: '0.1.4-rc.1',
  channel: '预发布版',
  nextVersion: '0.1.4-rc.2',
  notes: 'RC2 changes',
  received: 0,
  total: undefined,
  checkedAt: 0,
  error: '',
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
}));
vi.mock('./lib/useUpdates', () => ({ useUpdates: () => update }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

beforeEach(() => {
  update.status = 'available';
  window.localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('floats the available update outside page content and opens About and updates directly', async () => {
  render(<App gateway={createGateway()} />);
  const dock = await screen.findByRole('complementary', { name: '应用提醒' });
  const notice = within(dock).getByRole('status');
  expect(notice.textContent).toContain('0.1.4-rc.2');
  expect(notice.closest('main')).toBeNull();
  expect(within(dock).queryByRole('alert')).toBeNull();
  fireEvent.click(within(dock).getByRole('button', { name: '查看更新' }));
  expect(await screen.findByRole('heading', { name: '关于与更新' })).toBeTruthy();
  expect(
    within(await screen.findByRole('complementary', { name: '应用提醒' })).getByText(
      '发现新版本 0.1.4-rc.2',
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('region', { name: '版本与更新' }).querySelector('.floating-warnings'),
  ).toBeNull();
});

it('removes the floating update when it is no longer available', async () => {
  const gateway = createGateway();
  const view = render(<App gateway={gateway} />);
  await screen.findByRole('button', { name: '查看更新' });
  update.status = 'current';
  view.rerender(<App gateway={gateway} />);
  expect(screen.queryByRole('complementary', { name: '应用提醒' })).toBeNull();
});
