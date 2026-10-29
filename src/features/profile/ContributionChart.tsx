import { useI18n } from '../../i18n/I18n';
import type { GitHubProfile } from './model';

export function ContributionChart({
  collection,
}: {
  collection: GitHubProfile['contributionsCollection'];
}) {
  const { t, locale } = useI18n();
  const values = [
    collection.totalPullRequestReviewContributions,
    collection.totalIssueContributions,
    collection.totalPullRequestContributions,
    collection.totalCommitContributions,
  ];
  const labels = ['代码评审', 'Issues', 'Pull requests', '提交'];
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(1, ...values);
  const axes = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const points = values.map((value, index) => [
    200 + ((axes[index][0] * value) / max) * 82,
    150 + ((axes[index][1] * value) / max) * 82,
  ]);
  const positions = [
    { x: 200, y: 25, anchor: 'middle' },
    { x: 300, y: 146, anchor: 'start' },
    { x: 200, y: 265, anchor: 'middle' },
    { x: 100, y: 146, anchor: 'end' },
  ] as const;
  const percentage = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
      total ? value / total : 0,
    );
  return (
    <div className="contribution-chart">
      <svg viewBox="0 0 400 300" role="img" aria-label={t('贡献类型占比')}>
        <title>{t('贡献类型占比')}</title>
        <desc>
          {values.map((value, i) => `${t(labels[i])}: ${value} (${percentage(value)})`).join(' · ')}
        </desc>
        <path className="contribution-axis" d="M118 150H282M200 68V232" />
        <polygon
          className="contribution-shape"
          points={points.map((point) => point.join(',')).join(' ')}
        />
        {points.map(([cx, cy], i) => (
          <circle key={labels[i]} cx={cx} cy={cy} r="3" className="contribution-point" />
        ))}
        {positions.map(({ x, y, anchor }, i) => (
          <text key={labels[i]} x={x} y={y} textAnchor={anchor}>
            <tspan x={x}>{percentage(values[i])}</tspan>
            <tspan x={x} dy="18">
              {t(labels[i])}
            </tspan>
          </text>
        ))}
      </svg>
    </div>
  );
}
