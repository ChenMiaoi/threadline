import { localCommand } from './local-command';

export interface SystemFont {
  family: string;
  monospace: boolean;
}

export function loadSystemFonts() {
  return localCommand<SystemFont[]>('get_system_fonts');
}
