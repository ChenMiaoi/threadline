// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthoredPage } from './AuthoredPage';
import { pullFromGitHub } from '../../core/github';
import { record, repo, user } from '../../test/github.fixture';
afterEach(cleanup);
const pulls = [
  record,
  { ...record, number: 1031, title: 'Another open pull' },
  { ...record, number: 1000, title: 'A merged pull', state: 'MERGED' },
].map((value) => pullFromGitHub(value, user.id, repo));
function mount() {
  render(<AuthoredPage pulls={pulls} repo={repo} onOpen={vi.fn()} read={[]} onRead={vi.fn()} />);
}
describe('authored selection and filtering', () => {
  it('starts with an actionable pull even when waiting records were updated more recently', () => {
    render(
      <AuthoredPage
        pulls={[{ ...pulls[0], group: '等待评审' }, pulls[1]]}
        repo={repo}
        onOpen={vi.fn()}
        read={[]}
        onRead={vi.fn()}
      />,
    );
    expect(
      within(screen.getByRole('region', { name: '最新动态' })).getByText(/#1031/),
    ).toBeTruthy();
  });
  it('keeps the preview inside the filtered rows after searching', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 PR' }), {
      target: { value: '1042' },
    });
    const preview = within(screen.getByRole('region', { name: '最新动态' }));
    expect(preview.getByText(/#1042/)).toBeTruthy();
    expect(preview.queryByText(/#1031/)).toBeNull();
  });
  it('shows the selected status rather than a hidden selection from another tab', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
    fireEvent.click(screen.getByRole('tab', { name: /已合并\s*1/ }));
    expect(
      within(screen.getByRole('region', { name: '最新动态' })).getByText(/#1000/),
    ).toBeTruthy();
  });
  it('does not offer an unrelated discussion when no rows match', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /#1031/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 PR' }), {
      target: { value: 'not-found' },
    });
    expect(screen.queryByRole('region', { name: '最新动态' })).toBeNull();
  });
});
