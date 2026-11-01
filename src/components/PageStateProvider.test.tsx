// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PageScrollRestoration } from './PageStateProvider';
import { PageStateContext } from '../lib/page-state';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function setup() {
  const content = document.createElement('main');
  content.className = 'content';
  document.body.append(content);
  let height = 100;
  let top = 0;
  Object.defineProperty(content, 'scrollTop', {
    get: () => top,
    set: (value: number) => {
      top = Math.min(value, height);
    },
  });
  const cache = new Map<string, unknown>([['inbox.scroll', 320]]);
  const page = (loaded: boolean) => (
    <PageStateContext.Provider value={cache}>
      <PageScrollRestoration view="inbox" active />
      <div>{loaded ? 'Records loaded' : 'Loading records'}</div>
    </PageStateContext.Provider>
  );
  const view = render(page(false), { container: content });
  return {
    content,
    cache,
    load: () => {
      height = 1000;
      view.rerender(page(true));
    },
  };
}

it('waits for delayed data before completing scroll restoration', async () => {
  const { content, cache, load } = setup();
  expect(content.scrollTop).toBe(100);
  fireEvent.scroll(content);
  expect(cache.get('inbox.scroll')).toBe(320);
  load();
  await waitFor(() => expect(content.scrollTop).toBe(320));
  content.scrollTop = 500;
  fireEvent.scroll(content);
  expect(cache.get('inbox.scroll')).toBe(500);
});

it.each(['wheel', 'touchstart', 'keydown'])('does not jump after user %s input', async (input) => {
  const { content, cache, load } = setup();
  fireEvent(content, new Event(input));
  load();
  await waitFor(() => expect(content.textContent).toContain('Records loaded'));
  expect(content.scrollTop).toBe(100);
  expect(cache.get('inbox.scroll')).toBe(100);
});
