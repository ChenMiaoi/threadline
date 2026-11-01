import { useEffect, useState } from 'react';

// Subscribe at page level so list rows share one clock instead of one timer per row.
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const visible = () => {
      if (document.visibilityState === 'visible') update();
    };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return now;
}
