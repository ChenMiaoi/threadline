import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { playNotificationSound } from './notification-sound';

const host = vi.hoisted(() => ({ isDesktop: false }));
vi.mock('./desktop', () => host);
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const play = vi.fn();
const pause = vi.fn();
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.clearAllMocks();
  host.isDesktop = false;
  play.mockResolvedValue(undefined);
  vi.stubGlobal(
    'Audio',
    class {
      play = play;
      pause = pause;
      constructor(public src: string) {}
    },
  );
});

it('uses native playback on supported desktops without browser autoplay', async () => {
  host.isDesktop = true;
  vi.mocked(invoke).mockResolvedValue(true);
  await playNotificationSound('bell');
  expect(invoke).toHaveBeenCalledWith('play_notification_sound', { sound: 'bell' });
  expect(play).not.toHaveBeenCalled();
});

it('plays bundled audio on other hosts and stops overlapping previews', async () => {
  await playNotificationSound('soft');
  await playNotificationSound('double');
  expect(play).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  host.isDesktop = true;
  vi.mocked(invoke).mockResolvedValue(false);
  await playNotificationSound('bell');
  expect(play).toHaveBeenCalledTimes(3);
});

it('reports blocked playback so the user can retry with the preview button', async () => {
  play.mockRejectedValue(new Error('NotAllowedError'));
  await expect(playNotificationSound('soft')).rejects.toThrow('点击试听');
});
