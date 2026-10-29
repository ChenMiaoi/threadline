import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceRepository } from '../core/workspace';

export function desktopWorkspaceRepository(): WorkspaceRepository {
  return {
    load: async () => JSON.parse(await invoke<string>('get_workspace_data')) as unknown,
    save: async (data) => {
      await invoke('save_workspace_data', { data: JSON.stringify(data) });
    },
  };
}

export function browserWorkspaceRepository(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): WorkspaceRepository {
  const key = 'threadline.workspace.v1';
  return {
    load: async () => {
      const value = storage.getItem(key);
      return value === null ? null : (JSON.parse(value) as unknown);
    },
    save: async (data) => storage.setItem(key, JSON.stringify(data)),
  };
}
