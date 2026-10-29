import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveLocale, type LanguagePreference, type Locale } from './locale';
import messages from './messages.json';

type Dictionary = Record<string, string>;
const dictionaries = messages as Record<Exclude<Locale, 'zh-CN'>, Dictionary>;
export function translate(
  locale: Locale,
  source: string,
  values: readonly (string | number)[] = [],
): string {
  const text = locale === 'zh-CN' ? source : (dictionaries[locale][source] ?? source);
  return text.replace(/\{(\d+)\}/g, (_, index: string) =>
    String(values[Number(index)] ?? `{${index}}`),
  );
}
const chinese = {
  locale: 'zh-CN' as Locale,
  t: (source: string, values?: readonly (string | number)[]) => translate('zh-CN', source, values),
};
export const I18nContext = createContext(chinese);
export function useI18n() {
  return useContext(I18nContext);
}
export function useLanguage(preference: LanguagePreference) {
  const [languages, setLanguages] = useState(() => [...navigator.languages]);
  useEffect(() => {
    const update = () => setLanguages([...navigator.languages]);
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, []);
  const locale = resolveLocale(preference, languages);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return useMemo(
    () => ({
      locale,
      t: (source: string, values?: readonly (string | number)[]) =>
        translate(locale, source, values),
    }),
    [locale],
  );
}
