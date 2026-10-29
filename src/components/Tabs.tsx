import { useRef, useState, type ReactNode } from 'react';

export function TabList<T extends string>({
  id,
  label,
  value,
  onChange,
  items,
  className,
  tabClassName = '',
  activation = 'automatic',
}: {
  id: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: readonly { value: T; label: ReactNode }[];
  className?: string;
  tabClassName?: string;
  activation?: 'automatic' | 'manual';
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const [focus, setFocus] = useState({ selected: value, tab: value });
  const focusValue = focus.selected === value ? focus.tab : value;
  return (
    <div id={id} className={className} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={(button) => {
            if (button) buttons.current.set(item.value, button);
            else buttons.current.delete(item.value);
          }}
          id={`${id}-tab-${item.value}`}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          aria-controls={`${id}-panel`}
          tabIndex={focusValue === item.value ? 0 : -1}
          className={`${tabClassName}${value === item.value ? ' active' : ''}`.trim()}
          onFocus={() => setFocus({ selected: value, tab: item.value })}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            let target: number;
            switch (event.key) {
              case 'ArrowLeft':
                target = (index + items.length - 1) % items.length;
                break;
              case 'ArrowRight':
                target = (index + 1) % items.length;
                break;
              case 'Home':
                target = 0;
                break;
              case 'End':
                target = items.length - 1;
                break;
              default:
                return;
            }
            event.preventDefault();
            const next = items[target].value;
            buttons.current.get(next)?.focus();
            if (activation === 'automatic') onChange(next);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  id,
  value,
  className,
  children,
}: {
  id: string;
  value: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      id={`${id}-panel`}
      role="tabpanel"
      aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
