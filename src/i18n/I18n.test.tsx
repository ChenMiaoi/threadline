// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nContext, translate, useI18n, useLanguage } from './I18n';
import { locales, resolveLocale, type LanguagePreference } from './locale';
import { defaultWorkspace, normalizeWorkspace } from '../core/workspace';
import messages from './messages.json';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Label() {
  const { t } = useI18n();
  return <span>{t('收件箱')}</span>;
}
function Preview({ language }: { language: LanguagePreference }) {
  const value = useLanguage(language);
  return (
    <I18nContext.Provider value={value}>
      <Label />
    </I18nContext.Provider>
  );
}
describe('interface languages', () => {
  it('detects regional system languages and respects explicit selection', () => {
    expect(resolveLocale('system', ['zh-Hant-HK'])).toBe('zh-HK');
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh-TW');
    expect(resolveLocale('system', ['ja-JP'])).toBe('ja');
    expect(resolveLocale('system', ['de', 'en-GB'])).toBe('en');
    expect(resolveLocale('zh-CN', ['en'])).toBe('zh-CN');
  });
  it('persists every supported language and safely defaults invalid preferences', () => {
    for (const language of [...locales, 'system']) {
      const data = {
        ...defaultWorkspace(),
        preferences: { ...defaultWorkspace().preferences, language },
      };
      expect(
        normalizeWorkspace(JSON.parse(JSON.stringify(data)), Date.now()).preferences.language,
      ).toBe(language);
    }
    expect(
      normalizeWorkspace({ preferences: { language: 'invalid' } }, Date.now()).preferences.language,
    ).toBe('system');
  });
  it('switches visible labels and document language without reloading', () => {
    const { rerender } = render(<Preview language="en" />);
    expect(screen.getByText('Inbox')).toBeTruthy();
    for (const language of locales) {
      rerender(<Preview language={language} />);
      expect(screen.getByText(translate(language, '收件箱'))).toBeTruthy();
      expect(document.documentElement.lang).toBe(language);
    }
  });
  it('keeps dictionary keys and interpolation slots consistent', () => {
    const keys = Object.keys(messages.en).sort();
    for (const dictionary of Object.values(messages)) {
      expect(Object.keys(dictionary).sort()).toEqual(keys);
      for (const [source, translated] of Object.entries(dictionary)) {
        expect(translated.trim()).not.toBe('');
        expect((translated.match(/\{\d+\}/g) ?? []).sort()).toEqual(
          (source.match(/\{\d+\}/g) ?? []).sort(),
        );
      }
    }
    expect(translate('en', '选择 #{0}', [123])).toContain('123');
  });
});
