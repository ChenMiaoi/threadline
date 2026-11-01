import { createContext, useContext, useEffect, useState } from 'react';

export const PageStateContext = createContext<Map<string, unknown> | null>(null);

// Session-only view choices belong to the current account and repository.
export function usePageState<T>(key: string, initial: T | (() => T)) {
  const cache = useContext(PageStateContext);
  const state = useState<T>(() =>
    cache?.has(key)
      ? (cache.get(key) as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  );
  const [value] = state;
  useEffect(() => {
    cache?.set(key, value);
  }, [cache, key, value]);
  return state;
}
