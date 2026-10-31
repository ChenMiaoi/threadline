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
  canvas: string;
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
  variants?: Record<ColorMode, string>;
  dark: ThemePalette;
  light: ThemePalette;
}

// Palette roles are shared across modes; adapters decide how to render them.
function palette(
  surfaces: [string, string, string],
  text: [string, string, string],
  accents: [string, string, string, string, string, string],
  canvas = surfaces[0],
): ThemePalette {
  const [app, surface, raised] = surfaces;
  const [foreground, muted, dim] = text;
  const [accent, blue, green, yellow, danger, merged] = accents;
  return {
    app,
    canvas,
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
    variants: { dark: 'Moon', light: 'Dawn' },
    dark: palette(
      ['#232136', '#2a273f', '#393552'],
      ['#e0def4', '#908caa', '#6e6a86'],
      ['#ea9a97', '#9ccfd8', '#95b1ac', '#f6c177', '#eb6f92', '#c4a7e7'],
    ),
    light: palette(
      ['#faf4ed', '#fffaf3', '#f2e9e1'],
      ['#464261', '#797593', '#9893a5'],
      ['#b4637a', '#286983', '#6d8f89', '#ea9d34', '#b4637a', '#907aa9'],
    ),
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: '柔和粉彩与蓝紫层次',
    variants: { dark: 'Macchiato', light: 'Latte' },
    dark: palette(
      ['#1e2030', '#24273a', '#363a4f'],
      ['#cad3f5', '#b8c0e0', '#a5adcb'],
      ['#c6a0f6', '#8aadf4', '#a6da95', '#eed49f', '#ed8796', '#b7bdf8'],
      '#24273a',
    ),
    light: palette(
      ['#e6e9ef', '#eff1f5', '#dce0e8'],
      ['#4c4f69', '#5c5f77', '#6c6f85'],
      ['#8839ef', '#1e66f5', '#40a02b', '#df8e1d', '#d20f39', '#7287fd'],
      '#eff1f5',
    ),
  },
  {
    id: 'everforest',
    name: 'Everforest',
    description: '森林灰绿与暖米色',
    variants: { dark: 'Medium', light: 'Medium' },
    dark: palette(
      ['#232a2e', '#2d353b', '#343f44'],
      ['#d3c6aa', '#9da9a0', '#859289'],
      ['#a7c080', '#7fbbb3', '#83c092', '#dbbc7f', '#e67e80', '#d699b6'],
      '#2d353b',
    ),
    light: palette(
      ['#efebd4', '#fdf6e3', '#f4f0d9'],
      ['#5c6a72', '#829181', '#939f91'],
      ['#8da101', '#3a94c5', '#35a77c', '#dfa000', '#f85552', '#df69ba'],
      '#fdf6e3',
    ),
  },
  {
    id: 'nord',
    name: 'Nord',
    description: '北欧冷灰与冰青',
    variants: { dark: 'Polar Night', light: 'Snow Storm' },
    dark: palette(
      ['#2e3440', '#3b4252', '#434c5e'],
      ['#eceff4', '#d8dee9', '#a9b4c7'],
      ['#88c0d0', '#81a1c1', '#a3be8c', '#ebcb8b', '#bf616a', '#b48ead'],
    ),
    light: palette(
      ['#eceff4', '#e5e9f0', '#d8dee9'],
      ['#2e3440', '#3b4252', '#4c566a'],
      ['#88c0d0', '#81a1c1', '#a3be8c', '#ebcb8b', '#bf616a', '#b48ead'],
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
    variants: { dark: 'Gray 100', light: 'Gray 10' },
    dark: palette(
      ['#161616', '#262626', '#393939'],
      ['#f4f4f4', '#c6c6c6', '#b9b9b9'],
      ['#78a9ff', '#a6c8ff', '#6fdc8c', '#f1c21b', '#ffb3b8', '#d4bbff'],
    ),
    light: palette(
      ['#f4f4f4', '#ffffff', '#e0e0e0'],
      ['#161616', '#525252', '#565656'],
      ['#0f62fe', '#0043ce', '#198038', '#8e6a00', '#da1e28', '#6929c4'],
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
