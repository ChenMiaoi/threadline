export type ColorThemeId =
  | 'threadline'
  | 'rose-pine'
  | 'catppuccin'
  | 'everforest'
  | 'nord'
  | 'graphite'
  | 'paper'
  | 'walnut'
  | 'ocean'
  | 'carbon';

export type ColorMode = 'dark' | 'light';
export type ThemeMode = ColorMode | 'system';

export interface ThemePalette {
  app: string;
  surface: string;
  raised: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  blue: string;
  green: string;
  yellow: string;
  danger: string;
  merged: string;
}

export interface ColorTheme {
  id: ColorThemeId;
  name: string;
  description: string;
  dark: ThemePalette;
  light: ThemePalette;
}

// Palette roles are shared across modes; adapters decide how to render them.
function palette(
  surfaces: [string, string, string],
  text: [string, string, string],
  accents: [string, string, string, string, string, string],
): ThemePalette {
  const [app, surface, raised] = surfaces;
  const [foreground, muted, dim] = text;
  const [accent, blue, green, yellow, danger, merged] = accents;
  return {
    app,
    surface,
    raised,
    text: foreground,
    muted,
    dim,
    accent,
    blue,
    green,
    yellow,
    danger,
    merged,
  };
}

export const colorThemes: readonly ColorTheme[] = [
  {
    id: 'threadline',
    name: 'ThreadLine',
    description: '经典蓝灰与雾紫',
    dark: palette(
      ['#111318', '#181b22', '#20242d'],
      ['#e6eaf2', '#b0b7c6', '#979fae'],
      ['#aaa2ff', '#8aafff', '#6bd3ab', '#e8c472', '#f19299', '#c0a4f3'],
    ),
    light: palette(
      ['#eef1f6', '#ffffff', '#f5f6fa'],
      ['#202737', '#536078', '#596577'],
      ['#6453be', '#315db8', '#18714f', '#805600', '#ac3440', '#7344a6'],
    ),
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    description: '玫瑰、松青与紫灰',
    dark: palette(
      ['#232136', '#2a273f', '#393552'],
      ['#e0def4', '#b8b4d0', '#b8b4cc'],
      ['#eca5a2', '#9ccfd8', '#a4bcb8', '#f6c177', '#f29fb6', '#c7abe8'],
    ),
    light: palette(
      ['#faf4ed', '#fffaf3', '#f2e9e1'],
      ['#464261', '#605b72', '#625b6f'],
      ['#95435f', '#26657e', '#376660', '#7d5712', '#9c3c5b', '#6b538a'],
    ),
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: '柔和粉彩与蓝紫层次',
    dark: palette(
      ['#1e2030', '#24273a', '#363a4f'],
      ['#cad3f5', '#b8c0e0', '#b2b8d2'],
      ['#ccaaf7', '#9cb9f6', '#a6da95', '#eed49f', '#f1a4af', '#b7bdf8'],
    ),
    light: palette(
      ['#e6e9ef', '#eff1f5', '#dce0e8'],
      ['#4c4f69', '#55576d', '#55586d'],
      ['#7230c9', '#1851c2', '#2c6521', '#7a500a', '#b20d30', '#6f3fab'],
    ),
  },
  {
    id: 'everforest',
    name: 'Everforest',
    description: '森林灰绿与暖米色',
    dark: palette(
      ['#232a2e', '#2d353b', '#343f44'],
      ['#d3c6aa', '#b8bcac', '#b2bdb2'],
      ['#aac284', '#90c4bd', '#91c79e', '#dbbc7f', '#eea9aa', '#deacc4'],
    ),
    light: palette(
      ['#f3ead3', '#fdf6e3', '#eae8cf'],
      ['#4f5b58', '#526056', '#546057'],
      ['#4e6421', '#20666f', '#416633', '#7a5715', '#a33840', '#7e4c6f'],
    ),
  },
  {
    id: 'nord',
    name: 'Nord',
    description: '北欧冷灰与冰青',
    dark: palette(
      ['#2e3440', '#3b4252', '#434c5e'],
      ['#eceff4', '#d8dee9', '#cad3e1'],
      ['#b6d9e2', '#bed5ed', '#c8d8ba', '#eccf93', '#f3c8cd', '#e1cddd'],
    ),
    light: palette(
      ['#e5e9f0', '#eceff4', '#d8dee9'],
      ['#2e3440', '#434c5e', '#4c566a'],
      ['#2e5c6c', '#335882', '#435d2f', '#6c5118', '#913943', '#724867'],
    ),
  },
  {
    id: 'graphite',
    name: '石墨',
    description: '中性灰阶与克制的雾蓝',
    dark: palette(
      ['#131416', '#1a1b1f', '#24252b'],
      ['#ecedef', '#b0b2ba', '#9ea0aa'],
      ['#a6b7d8', '#9eb9e4', '#8cbaa1', '#d5b981', '#e49a9e', '#b9a9d4'],
    ),
    light: palette(
      ['#f0f1f2', '#fafafa', '#e7e8eb'],
      ['#25272c', '#555963', '#575b65'],
      ['#415c88', '#345c95', '#35654b', '#785519', '#973f48', '#6c5085'],
    ),
  },
  {
    id: 'paper',
    name: '纸白',
    description: '纸张色调与沉静墨绿',
    dark: palette(
      ['#1b211e', '#242d27', '#303b33'],
      ['#e6ece4', '#bdc9ba', '#acbcaa'],
      ['#aac5ad', '#96beca', '#9cc0a5', '#d6bf8f', '#e2a9a2', '#c4b0cc'],
    ),
    light: palette(
      ['#eff1ea', '#f7f8f5', '#e3e9df'],
      ['#28332e', '#505f56', '#525e55'],
      ['#326552', '#326174', '#316644', '#765621', '#96413f', '#6d517e'],
    ),
  },
  {
    id: 'walnut',
    name: '胡桃',
    description: '暖炭灰、铜色与米白',
    dark: palette(
      ['#1b1917', '#24211f', '#332d28'],
      ['#efe8dd', '#c3b5a5', '#b7a896'],
      ['#d1ac82', '#a6bdc4', '#a4bb9c', '#dbc38e', '#e6a29a', '#c5a6c2'],
    ),
    light: palette(
      ['#eee6dc', '#faf5ee', '#e9ded0'],
      ['#40352d', '#645445', '#645546'],
      ['#794d28', '#375c6e', '#3f5f3a', '#6e5315', '#8f3f35', '#6f4b6d'],
    ),
  },
  {
    id: 'ocean',
    name: '深海',
    description: '深蓝、雾青与微光',
    dark: palette(
      ['#0b141e', '#142431', '#223744'],
      ['#e3edf0', '#b0c3cd', '#9fb7c2'],
      ['#83c9cd', '#a1c7ee', '#9bd1b9', '#d9c28f', '#eea2ad', '#bfa9dd'],
    ),
    light: palette(
      ['#e7f0f2', '#f6fafb', '#dce9ee'],
      ['#233b49', '#465f6a', '#475f68'],
      ['#246470', '#2b5f90', '#2f664c', '#755715', '#9b3a4e', '#6f4e86'],
    ),
  },
  {
    id: 'carbon',
    name: 'Carbon',
    description: '清晰灰阶与蓝色强调',
    dark: palette(
      ['#161616', '#262626', '#393939'],
      ['#f4f4f4', '#c6c6c6', '#b9b9b9'],
      ['#93baff', '#a6c8ff', '#6fdc8c', '#f1c21b', '#ffb3b8', '#d4bbff'],
    ),
    light: palette(
      ['#f4f4f4', '#ffffff', '#e0e0e0'],
      ['#161616', '#525252', '#565656'],
      ['#0c4cc6', '#0043ce', '#1f6331', '#6e5100', '#ab171f', '#6929c4'],
    ),
  },
];

export function normalizeColorTheme(value: unknown): ColorThemeId {
  return colorThemes.find((theme) => theme.id === value)?.id ?? 'threadline';
}

export function resolveColorMode(mode: ThemeMode, systemLight: boolean): ColorMode {
  return mode === 'light' || (mode === 'system' && systemLight) ? 'light' : 'dark';
}

export function getColorTheme(id: ColorThemeId): ColorTheme {
  return colorThemes.find((theme) => theme.id === id) ?? colorThemes[0];
}
