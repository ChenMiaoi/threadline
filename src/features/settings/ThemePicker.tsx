import type { Preferences } from '../../core/workspace';
import { colorThemes } from '../../core/themes';
import { themeStyle, useColorMode } from '../../lib/theme';
import { useI18n } from '../../i18n/I18n';

export function ThemePicker({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (change: Partial<Preferences>) => void;
}) {
  const { t } = useI18n();
  const mode = useColorMode(preferences.theme);
  return (
    <div className="theme-picker">
      <div className="theme-modes" role="group" aria-label={t('明暗模式')}>
        {(['dark', 'light', 'system'] as const).map((theme, index) => (
          <button
            key={theme}
            className="chip"
            aria-pressed={preferences.theme === theme}
            onClick={() => onChange({ theme })}
          >
            {t(['深色', '浅色', '跟随系统'][index])}
          </button>
        ))}
      </div>
      <p className="theme-description">{t('每组主题都包含深色与浅色版本。')}</p>
      <div className="theme-options" role="group" aria-label={t('色彩主题')}>
        {colorThemes.map((theme) => (
          <button
            key={theme.id}
            className="theme-option"
            aria-label={t(theme.name)}
            aria-pressed={preferences.colorTheme === theme.id}
            onClick={() => onChange({ colorTheme: theme.id })}
          >
            <span
              className="theme-miniature"
              style={themeStyle(theme.id, mode, preferences.themeGradient)}
              aria-hidden="true"
            >
              <span className="mini-sidebar">
                <b />
              </span>
              <span className="mini-content">
                <i />
                <i />
                <i />
              </span>
              <span className="mini-swatches">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="theme-option-name">
              {t(theme.name)}
              <span className="theme-check" aria-hidden="true">
                {preferences.colorTheme === theme.id ? '✓' : ''}
              </span>
            </span>
            <span className="theme-option-description">{t(theme.description)}</span>
          </button>
        ))}
      </div>
      <label className="theme-gradient-option">
        <input
          type="checkbox"
          checked={preferences.themeGradient}
          onChange={(event) => onChange({ themeGradient: event.target.checked })}
        />
        {t('柔和渐变')}
      </label>
    </div>
  );
}
