import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const base = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const macos = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.macos.conf.json', import.meta.url), 'utf8'),
);

it('uses a frameless macOS window for the shared HTML controls', () => {
  const main = macos.app.windows.find((window: { label: string }) => window.label === 'main');
  expect(main.decorations).toBe(false);
  expect(main.create).not.toBe(false);
  expect(main.titleBarStyle).toBeUndefined();
  expect(main.trafficLightPosition).toBeUndefined();
});

it('keeps Windows and Linux frameless for the existing custom window controls', () => {
  const main = base.app.windows.find((window: { label: string }) => window.label === 'main');
  expect(main.decorations).toBe(false);
});
