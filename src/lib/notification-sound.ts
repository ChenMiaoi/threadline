import { invoke } from '@tauri-apps/api/core';
import type { NotificationSound } from '../core/notification-sound';
import { isDesktop } from './desktop';
import soft from '../assets/sounds/soft.wav';
import bell from '../assets/sounds/bell.wav';
import double from '../assets/sounds/double.wav';

const sources = { soft, bell, double };
let playing: HTMLAudioElement | undefined;

export async function playNotificationSound(sound: NotificationSound) {
  // Windows uses native playback so background refreshes do not depend on a
  // WebView autoplay grant. Other hosts use the same bundled audio recordings.
  if (isDesktop && (await invoke<boolean>('play_notification_sound', { sound }))) return;
  playing?.pause();
  const audio = new Audio(sources[sound]);
  playing = audio;
  try {
    await audio.play();
  } catch {
    if (playing === audio) playing = undefined;
    throw new Error('无法播放通知声音，请点击试听后重试。');
  }
}
