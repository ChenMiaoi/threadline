import { useI18n } from '../i18n/I18n';
import './icon.css';

export function Icon({ name }: { name: string }) {
  const image = `url("/assets/figma/${name}.svg")`;
  return (
    <span
      className={`icon icon-${name}`}
      style={{ maskImage: image, WebkitMaskImage: image }}
      aria-hidden="true"
    />
  );
}

export function IconButton({
  name,
  label,
  onClick,
  pressed,
  disabled,
}: {
  name: string;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <button
      className="icon-button"
      disabled={disabled}
      aria-label={t(label)}
      title={t(label)}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
