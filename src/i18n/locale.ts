export const locales = ['zh-CN', 'zh-TW', 'zh-HK', 'ja', 'en'] as const;
export type Locale = (typeof locales)[number];
export type LanguagePreference = Locale | 'system';

export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[],
): Locale {
  if (preference !== 'system') return preference;
  for (const language of languages) {
    const tag = language.toLowerCase();
    if (tag.startsWith('zh')) {
      if (/-(hk|mo)(-|$)/.test(tag)) return 'zh-HK';
      if (/-(tw|hant)(-|$)/.test(tag)) return 'zh-TW';
      return 'zh-CN';
    }
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}
