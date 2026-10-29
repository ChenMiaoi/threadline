// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ActivityPage } from './ActivityPage';
import { issueFromGitHub } from '../../core/github';
import { record, repo, user } from '../../test/github.fixture';
afterEach(cleanup);
describe('activity empty-state recovery', () => {
  it('clears search and labels when requesting all records', () => {
    const items = [
      issueFromGitHub(
        { ...record, labels: { nodes: [{ name: 'crash' }] } },
        user.id,
        repo,
        user.login,
      ),
    ];
    render(
      <ActivityPage
        view="issues"
        items={items}
        repo={repo}
        read={[]}
        onRead={vi.fn()}
        onSnooze={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), {
      target: { value: 'crash' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索协作记录' }), {
      target: { value: 'missing' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect((screen.getByRole('textbox', { name: '搜索协作记录' }) as HTMLInputElement).value).toBe(
      'missing',
    );
    fireEvent.click(screen.getByRole('button', { name: '查看全部记录' }));
    expect((screen.getByRole('textbox', { name: '搜索协作记录' }) as HTMLInputElement).value).toBe(
      '',
    );
    expect((screen.getByRole('combobox', { name: '标签' }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('tab', { name: '全部' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /#1042/ })).toBeTruthy();
  });
});
