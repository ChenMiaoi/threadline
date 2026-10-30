export type InstalledFont = `font:${string}`;
export interface TypographyPreferences {
  uiFont: 'default' | 'system' | InstalledFont;
  uiSize: number;
  readingFont: 'default' | 'system' | 'serif' | InstalledFont;
  readingSize: number;
  readingLineHeight: number;
  readingWidth: number;
  codeFont: 'default' | 'consolas' | 'cascadia' | 'menlo' | InstalledFont;
  codeSize: number;
  codeLineHeight: number;
  codeWrap: number;
}
export const defaultTypography: TypographyPreferences = {
  uiFont: 'default',
  uiSize: 14,
  readingFont: 'default',
  readingSize: 14,
  readingLineHeight: 1.65,
  readingWidth: 1120,
  codeFont: 'default',
  codeSize: 14,
  codeLineHeight: 1.7,
  codeWrap: 80,
};
export const typographyOptions = {
  uiFont: ['default', 'system'],
  uiSize: [12, 13, 14, 15, 16, 18],
  readingFont: ['default', 'system', 'serif'],
  readingSize: [12, 14, 16, 18, 20],
  readingLineHeight: [1.5, 1.65, 1.8, 2],
  readingWidth: [720, 900, 1120, 0],
  codeFont: ['default', 'consolas', 'cascadia', 'menlo'],
  codeSize: [12, 13, 14, 15, 16, 18],
  codeLineHeight: [1.4, 1.6, 1.7, 1.8, 2],
  codeWrap: [80, 100, 120, 0],
} as const;
export function normalizeTypography(value: unknown): TypographyPreferences {
  const result = { ...defaultTypography };
  if (!value || typeof value !== 'object') return result;
  for (const key of Object.keys(typographyOptions) as (keyof TypographyPreferences)[]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (
      (typographyOptions[key] as readonly unknown[]).includes(candidate) ||
      (key.endsWith('Font') &&
        typeof candidate === 'string' &&
        candidate.startsWith('font:') &&
        candidate.slice(5).trim().length > 0 &&
        candidate.length <= 261 &&
        !Array.from(candidate).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ))
    )
      Object.assign(result, { [key]: candidate });
  }
  return result;
}
