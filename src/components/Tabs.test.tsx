// @vitest-environment jsdom
import { useId, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TabList, TabPanel } from './Tabs';

afterEach(cleanup);

function Example({ manual = false }: { manual?: boolean }) {
  const id = useId();
  const [value, setValue] = useState('first');
  return (
    <>
      <TabList
        id={id}
        label="Example"
        value={value}
        onChange={setValue}
        activation={manual ? 'manual' : 'automatic'}
        items={[
          { value: 'first', label: 'First' },
          { value: 'second', label: 'Second' },
          { value: 'third', label: 'Third' },
        ]}
      />
      <TabPanel id={id} value={value}>
        {value} content
      </TabPanel>
      <button onClick={() => setValue('first')}>Reset</button>
    </>
  );
}

it('loops horizontal focus, supports Home/End, and keeps one tab in the tab order', () => {
  render(<Example />);
  const tabs = screen.getAllByRole('tab');
  act(() => tabs[0].focus());
  for (const [key, index] of [
    ['ArrowLeft', 2],
    ['ArrowRight', 0],
    ['ArrowRight', 1],
    ['End', 2],
    ['Home', 0],
  ] as const) {
    fireEvent.keyDown(document.activeElement!, { key });
    expect(document.activeElement).toBe(tabs[index]);
    expect(tabs[index].getAttribute('aria-selected')).toBe('true');
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[index]]);
    const panel = screen.getByRole('tabpanel');
    expect(tabs[index].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[index].id);
  }
});

it('keeps manual focus separate from selection until native button activation', () => {
  render(<Example manual />);
  const [first, second, third] = screen.getAllByRole('tab');
  act(() => first.focus());
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(second);
  expect(second.tabIndex).toBe(0);
  expect(first.tabIndex).toBe(-1);
  expect(first.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('first content');
  // Enter and Space produce the native button click; the tab handler leaves them untouched.
  for (const key of ['Enter', ' ']) {
    expect(fireEvent.keyDown(second, { key })).toBe(true);
  }
  fireEvent.click(second);
  expect(second.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('second content');
  fireEvent.keyDown(second, { key: 'End' });
  expect(document.activeElement).toBe(third);
  expect(second.getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(first.tabIndex).toBe(0);
  expect(third.tabIndex).toBe(-1);
});

it('keeps IDs unique across tab lists and stable when their selection changes', () => {
  render(
    <>
      <Example />
      <Example />
    </>,
  );
  const tabs = screen.getAllByRole('tab');
  const initialIds = tabs.map((tab) => tab.id);
  expect(new Set(initialIds).size).toBe(6);
  fireEvent.click(tabs[1]);
  expect(screen.getAllByRole('tab').map((tab) => tab.id)).toEqual(initialIds);
  expect(new Set(screen.getAllByRole('tabpanel').map((panel) => panel.id)).size).toBe(2);
});

it('ignores keys unrelated to tab navigation', () => {
  const change = vi.fn();
  render(
    <TabList
      id="test"
      label="Example"
      value="one"
      onChange={change}
      items={[{ value: 'one', label: 'One' }]}
    />,
  );
  expect(fireEvent.keyDown(screen.getByRole('tab'), { key: 'Tab' })).toBe(true);
  expect(fireEvent.keyDown(screen.getByRole('tab'), { key: 'ArrowDown' })).toBe(true);
  expect(change).not.toHaveBeenCalled();
});
