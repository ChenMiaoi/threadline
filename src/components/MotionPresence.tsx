import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Retain an exiting surface until its short animation completes. All business
// actions still run immediately; the retained surface cannot receive input.
export function MotionPresence({ children }: { children: ReactNode }) {
  const present = Boolean(children);
  const [snapshot, setSnapshot] = useState({ present, children });
  const host = useRef<HTMLDivElement>(null);
  if (present && children !== snapshot.children) setSnapshot({ present, children });
  else if (!present && snapshot.present) setSnapshot({ ...snapshot, present: false });

  useLayoutEffect(() => {
    if (present || !host.current) return;
    const element = host.current.firstElementChild as HTMLElement | null;
    if (!element) return;
    const root = element.closest('.workspace-root');
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setSnapshot({ present: false, children: null });
    };
    if (typeof element.animate !== 'function') {
      finish();
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => media.matches || Boolean(element.closest('.reduced-motion'));
    if (reduced()) {
      finish();
      return;
    }
    element.inert = true;
    // Start from the current frame when dismissal interrupts an entry effect.
    const style = getComputedStyle(element);
    const from = {
      opacity: style.opacity || '1',
      transform: style.transform && style.transform !== 'none' ? style.transform : 'translateY(0)',
    };
    element.getAnimations().forEach((entry) => {
      // The dialog's backdrop has its own exit effect and must finish separately.
      if (!(entry.effect as KeyframeEffect | null)?.pseudoElement) entry.cancel();
    });
    const animation = element.animate(
      [
        from,
        {
          opacity: 0,
          transform: element.classList.contains('pr-preview')
            ? 'translateX(8px)'
            : 'translateY(4px)',
        },
      ],
      { duration: 120, easing: 'ease-in', fill: 'forwards' },
    );
    const stop = () => {
      animation.cancel();
      finish();
    };
    void animation.finished.then(finish, finish);
    const observer = new MutationObserver(() => {
      if (reduced()) stop();
    });
    if (root) observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    media.addEventListener('change', stop);
    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener('change', stop);
      animation?.cancel();
      element.inert = false;
    };
  }, [present]);

  return (
    <div
      className="motion-presence"
      ref={host}
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {snapshot.children}
    </div>
  );
}
