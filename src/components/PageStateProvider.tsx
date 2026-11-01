import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PageStateContext } from '../lib/page-state';

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map<string, unknown>());
  return <PageStateContext.Provider value={cache}>{children}</PageStateContext.Provider>;
}

export function PageScrollRestoration({ view, active }: { view: string; active: boolean }) {
  const cache = useContext(PageStateContext);
  const marker = useRef<HTMLSpanElement>(null);
  const restored = useRef(false);
  useLayoutEffect(() => {
    const content = marker.current?.closest<HTMLElement>('.content');
    if (!content || !cache || !active) return;
    const key = `${view}.scroll`;
    const target = Number(cache.get(key) ?? 0);
    let pending = !restored.current && target > 0;
    const observer = new MutationObserver(restore);
    function stopWatching() {
      observer.disconnect();
      content!.removeEventListener('wheel', cancelRestore);
      content!.removeEventListener('touchstart', cancelRestore);
      content!.removeEventListener('keydown', cancelRestore);
      content!.removeEventListener('transitionend', restore);
      window.removeEventListener('resize', restore);
    }
    function restore() {
      if (!pending) return;
      content!.scrollTop = target;
      if (Math.abs(content!.scrollTop - target) <= 1) {
        pending = false;
        stopWatching();
      }
    }
    function cancelRestore() {
      pending = false;
      stopWatching();
      cache!.set(key, content!.scrollTop);
    }
    if (!restored.current) {
      content.scrollTop = target;
      restored.current = true;
    }
    restore();
    if (pending) {
      // Data can arrive after this page mounts. Retry when it changes the layout,
      // but stop as soon as the user starts navigating or editing the page.
      observer.observe(content, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden', 'class', 'style', 'data-open'],
      });
      content.addEventListener('wheel', cancelRestore, { passive: true });
      content.addEventListener('touchstart', cancelRestore, { passive: true });
      content.addEventListener('keydown', cancelRestore);
      content.addEventListener('transitionend', restore);
      window.addEventListener('resize', restore);
    }
    const remember = () => {
      if (!pending) cache.set(key, content.scrollTop);
    };
    content.addEventListener('scroll', remember);
    return () => {
      stopWatching();
      content.removeEventListener('scroll', remember);
    };
  }, [cache, view, active]);
  return <span ref={marker} hidden />;
}
