// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ContributionChart } from './ContributionChart';
import type { GitHubProfile } from './model';
afterEach(cleanup);
const collection: GitHubProfile['contributionsCollection'] = {
  contributionYears: [2026],
  totalCommitContributions: 8,
  totalIssueContributions: 3,
  totalPullRequestContributions: 23,
  totalPullRequestReviewContributions: 17,
  contributionCalendar: { totalContributions: 51, weeks: [] },
};
it('shows proportions from the same four totals as the profile cards', () => {
  render(<ContributionChart collection={collection} />);
  const chart = screen.getByRole('img', { name: '贡献类型占比' });
  expect(chart.textContent).toContain('代码评审: 17 (33%)');
  expect(chart.textContent).toContain('Issues: 3 (6%)');
  expect(chart.textContent).toContain('Pull requests: 23 (45%)');
  expect(chart.textContent).toContain('提交: 8 (16%)');
});
it('renders a finite empty chart when there are no contributions', () => {
  const { container } = render(
    <ContributionChart
      collection={{
        ...collection,
        totalCommitContributions: 0,
        totalIssueContributions: 0,
        totalPullRequestContributions: 0,
        totalPullRequestReviewContributions: 0,
      }}
    />,
  );
  expect(container.querySelector('polygon')?.getAttribute('points')).toBe(
    '200,150 200,150 200,150 200,150',
  );
  expect(container.textContent).not.toMatch(/NaN|Infinity/);
});
