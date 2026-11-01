// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PageStateProvider } from '../components/PageStateProvider';
import { usePageState } from './page-state';

afterEach(cleanup);
function View({ name }: { name: string }) {
  const [query, setQuery] = usePageState(`${name}.query`, '');
  return (
    <input aria-label="query" value={query} onChange={(event) => setQuery(event.target.value)} />
  );
}
function Workspace({ scope, view }: { scope: string; view: string }) {
  return (
    <PageStateProvider key={scope}>
      <View key={view} name={view} />
    </PageStateProvider>
  );
}
it('restores each page independently and clears choices when the account or repository changes', () => {
  const { rerender } = render(<Workspace scope="account:repo-a" view="profile" />);
  fireEvent.change(screen.getByLabelText('query'), { target: { value: '2025' } });
  rerender(<Workspace scope="account:repo-a" view="inbox" />);
  expect(screen.getByLabelText('query')).toHaveProperty('value', '');
  fireEvent.change(screen.getByLabelText('query'), { target: { value: 'inbox search' } });
  rerender(<Workspace scope="account:repo-a" view="profile" />);
  expect(screen.getByLabelText('query')).toHaveProperty('value', '2025');
  rerender(<Workspace scope="account:repo-b" view="profile" />);
  expect(screen.getByLabelText('query')).toHaveProperty('value', '');
});
