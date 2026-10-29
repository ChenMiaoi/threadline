import { invoke, isTauri } from '@tauri-apps/api/core';

export const views = [
  'inbox',
  'authored',
  'review',
  'issues',
  'settings',
  'onboarding',
  'snoozed',
  'empty',
  'sync-error',
] as const;
export type View = (typeof views)[number];

export interface AppState {
  databasePath: string;
  schemaVersion: number;
  lastView: View;
}

export const isDesktop = isTauri();
export const isMacDesktop =
  isDesktop && typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent);

export function loadAppState(): Promise<AppState> {
  return invoke<AppState>('get_app_state');
}

export function saveLastView(view: View): Promise<void> {
  return invoke('save_last_view', { view });
}
