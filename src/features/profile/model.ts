export interface GitHubProfile {
  repository: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
  bio: string | null;
  createdAt: string;
  contributionsCollection: {
    contributionYears: number[];
    totalCommitContributions: number;
    totalIssueContributions: number;
    totalPullRequestContributions: number;
    totalPullRequestReviewContributions: number;
    contributionCalendar: {
      totalContributions: number;
      weeks: {
        contributionDays: {
          date: string;
          weekday: number;
          contributionCount: number;
          contributionLevel: string;
        }[];
      }[];
    };
  };
}
