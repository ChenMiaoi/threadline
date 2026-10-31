import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const base = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const macos = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.macos.conf.json', import.meta.url), 'utf8'),
);

it('integrates macOS window controls into the app header without an extra titlebar', () => {
  const main = macos.app.windows.find((window: { label: string }) => window.label === 'main');
  expect(main).toMatchObject({
    decorations: true,
    titleBarStyle: 'Overlay',
    hiddenTitle: true,
    trafficLightPosition: { x: 16, y: 22 },
  });
});

it('keeps Windows and Linux frameless for the existing custom window controls', () => {
  const main = base.app.windows.find((window: { label: string }) => window.label === 'main');
  expect(main.decorations).toBe(false);
});
