import { createContext, useContext, type ReactNode } from 'react';

export interface Notice {
  id: string;
  title: string;
  content: ReactNode;
  kind: 'warning' | 'update' | 'info';
}
export const WarningContext = createContext<{
  put: (warning: Notice) => void;
  remove: (id: string) => void;
  mountLayer: (element: HTMLElement) => () => void;
} | null>(null);

export function useFloatingLayer() {
  return useContext(WarningContext)?.mountLayer;
}
