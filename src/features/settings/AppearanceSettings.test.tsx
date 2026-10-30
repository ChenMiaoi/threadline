// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppearanceSettings } from './AppearanceSettings';
import { defaultWorkspace } from '../../core/workspace';
vi.mock('../../lib/system-fonts', () => ({
  loadSystemFonts: vi.fn().mockResolvedValue([
    { family: 'Consolas', monospace: true },
    { family: 'Microsoft YaHei', monospace: false },
  ]),
}));
afterEach(cleanup);
it('shows four groups, updates live previews, and resets only the selected group', async () => {
  function Harness() {
    const [preferences, set] = useState(defaultWorkspace().preferences);
    return (
      <AppearanceSettings
        preferences={preferences}
        onChange={(change) => set((p) => ({ ...p, ...change }))}
      />
    );
  }
  render(<Harness />);
  for (const label of ['主题与布局', '界面文字', '阅读内容', '代码展示'])
    expect(screen.getByRole('region', { name: label })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('界面字号'), { target: { value: '18' } });
  fireEvent.change(screen.getByLabelText('代码字号'), { target: { value: '16' } });
  expect(screen.getByLabelText('界面字号')).toHaveProperty('value', '18');
  expect(screen.getByLabelText('代码字号')).toHaveProperty('value', '16');
  fireEvent.click(
    within(screen.getByRole('region', { name: '代码展示' })).getByRole('button', {
      name: '恢复代码展示默认值',
    }),
  );
  expect(screen.getByLabelText('代码字号')).toHaveProperty('value', '14');
  expect(screen.getByLabelText('界面字号')).toHaveProperty('value', '18');
  await screen.findByText('return');
  expect(screen.getByLabelText('代码展示预览').textContent).toContain('return left + right');
});

it('lists installed fonts with monospace metadata and saves the actual family', async () => {
  const onChange = vi.fn();
  render(<AppearanceSettings preferences={defaultWorkspace().preferences} onChange={onChange} />);
  const select = screen.getByLabelText('界面字体');
  await within(select).findByRole('option', { name: 'Microsoft YaHei' });
  expect(
    within(screen.getByLabelText('代码字体')).getByRole('group', { name: '等宽字体' }).textContent,
  ).toContain('Consolas');
  fireEvent.change(select, { target: { value: 'font:Microsoft YaHei' } });
  expect(onChange.mock.lastCall?.[0].typography.uiFont).toBe('font:Microsoft YaHei');
  const keyword = await screen.findByText('return');
  expect(keyword.classList.contains('hljs-keyword')).toBe(true);
  expect(screen.getByText('"sum"').classList.contains('hljs-string')).toBe(true);
  expect(
    screen.getByLabelText('代码展示预览').querySelectorAll('.code-preview-number'),
  ).toHaveLength(6);
});
