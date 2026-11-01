// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('updates periodically, catches up on focus and visibility, and cleans up its timer', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
  const { result, unmount } = renderHook(useNow);
  const start = result.current;
  act(() => vi.advanceTimersByTime(60_000));
  expect(result.current).toBe(start + 60_000);
  vi.setSystemTime(start + 3_600_000);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(result.current).toBe(start + 3_600_000);
  vi.setSystemTime(start + 7_200_000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(result.current).toBe(start + 7_200_000);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.restoreAllMocks();
});
