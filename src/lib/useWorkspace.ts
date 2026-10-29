import { useEffect, useRef, useState } from 'react';
import {
  defaultWorkspace,
  normalizeWorkspace,
  releaseDue,
  type WorkspaceData,
  type WorkspaceRepository,
} from '../core/workspace';

export function useWorkspace(repository: WorkspaceRepository) {
  const [data, setData] = useState(() => defaultWorkspace(Date.now()));
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((value) => {
        const restored = normalizeWorkspace(value, Date.now());
        if (active) {
          setData(restored);
          setLoaded(true);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(String(reason));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [repository]);
  useEffect(() => {
    if (!loaded || !dirty || error) return;
    queue.current = queue.current
      .then(() => repository.save(data))
      .catch((reason) => setError(String(reason)));
  }, [data, dirty, loaded, error, repository]);
  useEffect(() => {
    if (!loaded || error) return;
    const timer = setInterval(() => {
      setData((current) => releaseDue(current, Date.now()));
      setDirty(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [loaded, error]);
  function update(change: (current: WorkspaceData) => WorkspaceData) {
    if (!loaded || error) return;
    setData(change);
    setDirty(true);
  }
  return { data, update, loaded, error };
}
