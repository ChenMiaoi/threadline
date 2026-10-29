export function Icon({ name }: { name: string }) {
  return <img className={`icon icon-${name}`} src={`/assets/figma/${name}.svg`} alt="" />;
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
  return (
    <button
      className="icon-button"
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
