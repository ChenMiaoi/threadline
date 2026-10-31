import { Select } from '../../components/Select';
import type { Preferences } from '../../core/workspace';
import { colorThemes, getColorTheme, type ColorThemeId } from '../../core/themes';
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
  const theme = getColorTheme(preferences.colorTheme);
  const palette = theme[mode];
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
      <div className="theme-selection">
        <div className="theme-selection-controls">
          <label className="theme-select-label" htmlFor="color-theme">
            {t('色彩主题')}
          </label>
          <Select
            id="color-theme"
            value={theme.id}
            onChange={(event) => onChange({ colorTheme: event.target.value as ColorThemeId })}
          >
            {colorThemes.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.name)}
              </option>
            ))}
          </Select>
          {theme.variants && <span className="theme-variant">{theme.variants[mode]}</span>}
          <p className="theme-description">{t(theme.description)}</p>
        </div>
        <div
          className="theme-preview"
          role="group"
          aria-label={t('主题预览')}
          style={themeStyle(theme.id, mode, preferences.themeGradient)}
        >
          <div className="theme-miniature" aria-hidden="true">
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
          </div>
          <div className="theme-palette">
            {(
              [
                ['canvas', '背景色'],
                ['surface', '面板色'],
                ['text', '文字色'],
                ['accent', '强调色'],
                ['blue', '辅助色'],
              ] as const
            ).map(([role, label]) => (
              <div className="theme-color" key={role}>
                <span
                  className="theme-color-swatch"
                  style={{ background: palette[role] }}
                  role="img"
                  aria-label={`${t(label)} ${palette[role]}`}
                />
                <span>{t(label)}</span>
              </div>
            ))}
          </div>
        </div>
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
