export function Icon({ name }: { name: string }) {
  return <img className={`icon icon-${name}`} src={`/assets/figma/${name}.svg`} alt="" />;
}

export function IconButton({
  name,
  label,
  onClick,
  pressed,
}: {
  name: string;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
