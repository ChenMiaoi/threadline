import type { ComponentPropsWithRef } from 'react';
import { Icon } from './Icon';
import './select.css';

export function Select({ className, ...props }: ComponentPropsWithRef<'select'>) {
  return (
    <span className="select-control">
      <select className={className ? `select-input ${className}` : 'select-input'} {...props} />
      <Icon name="chev" />
    </span>
  );
}
