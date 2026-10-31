import { lazy, Suspense, useEffect, useState } from 'react';
import { loadSystemFonts, type SystemFont } from '../../lib/system-fonts';
import type { Preferences } from '../../core/workspace';
import {
  defaultTypography,
  typographyOptions,
  type TypographyPreferences,
} from '../../core/appearance';
import { typographyStyle } from '../../lib/appearance';
import { useI18n } from '../../i18n/I18n';
import { ThemePicker } from './ThemePicker';

const CodePreview = lazy(() => import('../../components/CodePreview'));

export function AppearanceSettings({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (change: Partial<Preferences>) => void;
}) {
  const { t } = useI18n();
  const prefs = preferences.typography;
  const [systemFonts, setSystemFonts] = useState<SystemFont[]>([]);
  const [fontState, setFontState] = useState('loading');
  useEffect(() => {
    let active = true;
    loadSystemFonts()
      .then((fonts) => {
        if (active) {
          setSystemFonts(fonts);
          setFontState('ready');
        }
      })
      .catch(() => {
        if (active) setFontState('error');
      });
    return () => {
      active = false;
    };
  }, []);
  function change(key: keyof TypographyPreferences, value: string) {
    onChange({
      typography: {
        ...prefs,
        [key]: typeof defaultTypography[key] === 'number' ? Number(value) : value,
      },
    });
  }
  const labels: Record<string, string> = {
    default: '默认字体',
    system: '系统字体',
    serif: '衬线字体',
    consolas: 'Consolas',
    cascadia: 'Cascadia Code',
    menlo: 'Menlo',
  };
  function control(key: keyof TypographyPreferences, label: string) {
    return (
      <label className="appearance-field" key={key}>
        <span>{t(label)}</span>
        <select
          aria-label={t(label)}
          value={prefs[key]}
          onChange={(e) => change(key, e.target.value)}
        >
          {key.endsWith('Font') &&
            prefs[key].toString().startsWith('font:') &&
            !systemFonts.some((font) => `font:${font.family}` === prefs[key]) && (
              <option value={prefs[key]}>{prefs[key].toString().slice(5)}</option>
            )}
          {typographyOptions[key]
            .filter(
              (value) =>
                typeof value !== 'string' ||
                ['default', 'system', 'serif'].includes(value) ||
                value === prefs[key],
            )
            .map((value) => (
              <option key={value} value={value}>
                {typeof value === 'string'
                  ? t(labels[value])
                  : value === 0
                    ? t(key === 'codeWrap' ? '不换行' : '铺满宽度')
                    : key.endsWith('Size')
                      ? `${value} px`
                      : key === 'codeWrap'
                        ? t('{0} 字符', [value])
                        : key === 'readingWidth'
                          ? `${value} px`
                          : value}
              </option>
            ))}
          {key.endsWith('Font') &&
            (['mono', 'other'] as const).map((group) => {
              const fonts = systemFonts.filter((font) => font.monospace === (group === 'mono'));
              return fonts.length > 0 ? (
                <optgroup key={group} label={t(group === 'mono' ? '等宽字体' : '本机字体')}>
                  {fonts.map((font) => (
                    <option key={font.family} value={`font:${font.family}`}>
                      {font.family}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          {key.endsWith('Font') && fontState !== 'ready' && (
            <option disabled>
              {t(fontState === 'loading' ? '正在读取本机字体…' : '无法读取本机字体')}
            </option>
          )}
        </select>
      </label>
    );
  }
  function reset(keys: (keyof TypographyPreferences)[]) {
    const typography = { ...prefs };
    for (const key of keys) Object.assign(typography, { [key]: defaultTypography[key] });
    onChange({ typography });
  }
  const groups: {
    title: string;
    controls: [keyof TypographyPreferences, string][];
    preview: string;
  }[] = [
    {
      title: '界面文字',
      controls: [
        ['uiFont', '界面字体'],
        ['uiSize', '界面字号'],
      ],
      preview: 'ui',
    },
    {
      title: '阅读内容',
      controls: [
        ['readingFont', '正文字体'],
        ['readingSize', '正文字号'],
        ['readingLineHeight', '正文行距'],
        ['readingWidth', '正文宽度'],
      ],
      preview: 'reading',
    },
    {
      title: '代码展示',
      controls: [
        ['codeFont', '代码字体'],
        ['codeSize', '代码字号'],
        ['codeLineHeight', '代码行距'],
        ['codeWrap', '视觉换行宽度'],
      ],
      preview: 'code',
    },
  ];
  return (
    <div className="appearance-settings" style={typographyStyle(prefs)}>
      <section className="appearance-group" aria-label={t('主题与布局')}>
        <header>
          <h2>{t('主题与布局')}</h2>
          <button
            className="text-button"
            onClick={() =>
              onChange({
                theme: 'dark',
                colorTheme: 'threadline',
                themeGradient: true,
                density: 'comfortable',
                reducedMotion: true,
              })
            }
          >
            {t('恢复默认')}
          </button>
        </header>
        <ThemePicker preferences={preferences} onChange={onChange} />
        <div className="appearance-fields">
          <label className="appearance-field">
            <span>{t('信息密度')}</span>
            <select
              aria-label={t('信息密度')}
              value={preferences.density}
              onChange={(e) => onChange({ density: e.target.value as Preferences['density'] })}
            >
              <option value="comfortable">{t('舒适')}</option>
              <option value="compact">{t('紧凑')}</option>
            </select>
          </label>
          <div className="appearance-field">
            <span>{t('减少动效')}</span>
            <button
              className={`toggle-switch ${preferences.reducedMotion ? 'is-on' : ''}`}
              role="switch"
              aria-label={t('减少动效')}
              aria-checked={preferences.reducedMotion}
              onClick={() => onChange({ reducedMotion: !preferences.reducedMotion })}
            >
              <span className="toggle-track" aria-hidden="true">
                <span />
              </span>
              <span className="toggle-label">{t(preferences.reducedMotion ? '开启' : '关闭')}</span>
            </button>
          </div>
        </div>
      </section>
      {groups.map((group) => (
        <section key={group.title} className="appearance-group" aria-label={t(group.title)}>
          <header>
            <h2>{t(group.title)}</h2>
            <button
              className="text-button"
              aria-label={t('恢复{0}默认值', [t(group.title)])}
              onClick={() => reset(group.controls.map(([key]) => key))}
            >
              {t('恢复默认')}
            </button>
          </header>
          <div className="appearance-fields">
            {group.controls.map(([key, label]) => control(key, label))}
          </div>
          <div
            className={`appearance-preview appearance-preview-${group.preview}`}
            aria-label={t('{0}预览', [t(group.title)])}
          >
            {group.preview === 'code' ? (
              <Suspense fallback={<pre>template &lt;typename T&gt;</pre>}>
                <CodePreview />
              </Suspense>
            ) : group.preview === 'reading' ? (
              <>
                <strong>Pull request #234830</strong>
                <p>{t('调整字体与间距，让描述、讨论和评审更易阅读。')}</p>
              </>
            ) : (
              <>
                <strong>ThreadLine</strong>
                <span>
                  {t('收件箱')} · {t('我审阅的')} · Issues
                </span>
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
