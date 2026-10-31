// @vitest-environment jsdom
import { createRef, useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Select } from './Select';

afterEach(cleanup);

it('keeps label association, selection changes, and form values native', () => {
  function Form() {
    const [theme, setTheme] = useState('rose');
    return (
      <form aria-label="Appearance">
        <label>
          Theme
          <Select name="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="rose">Rosé Pine</option>
            <option value="nord">Nord</option>
          </Select>
        </label>
      </form>
    );
  }
  render(<Form />);
  const select = screen.getByRole('combobox', { name: 'Theme' });
  fireEvent.change(select, { target: { value: 'nord' } });
  expect(screen.getByRole('option', { name: 'Nord' })).toHaveProperty('selected', true);
  expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('theme')).toBe('nord');
  expect(screen.queryByRole('img')).toBeNull();
});

it('forwards focus refs and disabled state to the actual control', () => {
  const ref = createRef<HTMLSelectElement>();
  const view = render(
    <Select ref={ref} aria-label="Density">
      <option>Comfortable</option>
    </Select>,
  );
  ref.current?.focus();
  expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Density' }));
  view.rerender(
    <Select ref={ref} aria-label="Density" disabled>
      <option>Comfortable</option>
    </Select>,
  );
  expect(ref.current).toHaveProperty('disabled', true);
});
