import { ContributionChart } from './ContributionChart';
import { useI18n } from '../../i18n/I18n';
import { useState, type CSSProperties } from 'react';
import type { GitHubGateway, GitHubUser } from '../../core/github';
import { GitHubAvatar } from '../../components/GitHubAvatar';
import { useGitHubResource, type ResourceCache } from '../../lib/useGitHubResource';
import type { GitHubProfile } from './model';
import './profile.css';

const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
export function ProfilePage({
  user,
  repo,
  gateway,
  cache,
}: {
  user: GitHubUser;
  repo: string;
  gateway: GitHubGateway;
  cache: ResourceCache;
}) {
  const { t, locale } = useI18n();

  const [selectedDay, setSelectedDay] = useState(0);
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(currentYear);
  const resource = useGitHubResource<GitHubProfile>(gateway, cache, 'profile', repo, user.id, year);
  const profile = resource.response?.payload;
  const collection = profile?.contributionsCollection;
  const calendar = collection?.contributionCalendar;
  const days = calendar?.weeks.flatMap((week) => week.contributionDays) ?? [];
  const activeDay = days[Math.min(selectedDay, Math.max(0, days.length - 1))];
  const years = [...new Set([currentYear, year, ...(collection?.contributionYears ?? [])])].sort(
    (a, b) => b - a,
  );
  return (
    <section className="profile-page" aria-labelledby="profile-heading">
      <header className="profile-heading">
        <div>
          <p className="profile-eyebrow">GITHUB PROFILE</p>
          <h1 id="profile-heading">{t('个人主页')}</h1>
          <p>{t('你在当前仓库的 GitHub 年度贡献')}</p>
        </div>
      </header>
      <div className="profile-identity">
        <GitHubAvatar login={user.login} url={profile?.avatarUrl ?? user.avatar_url} />
        <div>
          <h2>{profile?.name || user.name || user.login}</h2>
          <span>@{user.login}</span>
          {profile?.bio && <p>{profile.bio}</p>}
        </div>
        <button
          className="chip"
          onClick={() => void gateway.open(`https://github.com/${encodeURIComponent(user.login)}`)}
        >
          {t('在 GitHub 查看')}
        </button>
      </div>
      <div className="profile-toolbar">
        <div className="profile-period" role="group" aria-label={t('贡献活动')}>
          <span className="profile-loading" role="status">
            {resource.loading && (
              <>
                {t('正在读取')}
                {year} {t('年 GitHub 贡献…')}
              </>
            )}
          </span>
          <label>
            {t('年份')}{' '}
            <select
              aria-label={t('贡献年份')}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {years.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            className="chip"
            aria-label={t('刷新个人主页')}
            disabled={resource.loading}
            onClick={resource.retry}
          >
            {t('刷新')}
          </button>
        </div>
        {resource.error && (
          <div className="profile-error" role="alert">
            <p>
              {t('暂时无法更新个人主页：')}
              {resource.error}
            </p>
            {profile && <p>{t('当前显示上次读取的数据，可能不是最新。')}</p>}
            <button className="chip" onClick={resource.retry}>
              {t('重试个人主页')}
            </button>
          </div>
        )}
      </div>
      {collection && calendar && (
        <>
          <div className="contribution-card">
            <h3>
              {year} {t('年共')} {calendar.totalContributions.toLocaleString(locale)} {t('次贡献')}
            </h3>
            <div
              className="contribution-scroll"
              tabIndex={0}
              aria-label={t('{0} 年每日贡献日历，使用方向键选择日期', [year])}
              aria-describedby="contribution-selected-day"
              onKeyDown={(event) => {
                const offset = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[
                  event.key
                ];
                if (offset !== undefined || event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  setSelectedDay((index) =>
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? days.length - 1
                        : Math.max(0, Math.min(days.length - 1, index + (offset ?? 0))),
                  );
                }
              }}
            >
              <div
                className="contribution-calendar"
                style={
                  { '--contribution-weeks': Math.max(1, calendar.weeks.length) } as CSSProperties
                }
                role="list"
                aria-label={t('每日 GitHub 贡献')}
              >
                <div className="contribution-week contribution-weekdays" aria-hidden="true">
                  <span style={{ gridRow: 3 }}>{t('一')}</span>
                  <span style={{ gridRow: 5 }}>{t('三')}</span>
                  <span style={{ gridRow: 7 }}>{t('五')}</span>
                </div>
                {calendar.weeks.map((week, index) => (
                  <div className="contribution-week" key={index}>
                    <span className="contribution-month" aria-hidden="true">
                      {index === 0 || week.contributionDays.some((day) => day.date.endsWith('-01'))
                        ? t('{0}月', [Number(week.contributionDays.at(-1)?.date.slice(5, 7))])
                        : ''}
                    </span>
                    {week.contributionDays.map((day) => (
                      <span
                        key={day.date}
                        role="listitem"
                        className={`contribution-day contribution-level-${Math.max(0, levels.indexOf(day.contributionLevel))}`}
                        style={{ gridRow: day.weekday + 2 }}
                        onMouseEnter={() => setSelectedDay(days.indexOf(day))}
                        data-selected={activeDay?.date === day.date}
                        aria-label={t('{0}：{1} 次贡献', [day.date, day.contributionCount])}
                        data-tooltip={t('{0} · {1} 次贡献', [day.date, day.contributionCount])}
                        title={t('{0}：{1} 次贡献', [day.date, day.contributionCount])}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <p id="contribution-selected-day" aria-live="polite">
              {activeDay
                ? t('{0}：{1} 次贡献', [activeDay.date, activeDay.contributionCount])
                : t('该年度没有可显示的贡献日期')}
            </p>
            <div className="contribution-footer">
              <div className="contribution-legend" aria-label={t('颜色由浅到深表示贡献由少到多')}>
                {t('少')}{' '}
                {levels.map((level, index) => (
                  <span key={level} className={`contribution-day contribution-level-${index}`} />
                ))}{' '}
                {t('多')}
              </div>
            </div>
          </div>
          <div className="profile-overview">
            <div className="profile-stats">
              {[
                ['提交', collection.totalCommitContributions],
                ['Issues', collection.totalIssueContributions],
                ['Pull requests', collection.totalPullRequestContributions],
                ['代码评审', collection.totalPullRequestReviewContributions],
              ].map(([label, value]) => (
                <div className="profile-stat" key={label}>
                  <span>{t(String(label))}</span>
                  <strong>{Number(value).toLocaleString(locale)}</strong>
                  <small>
                    {year} {t('年贡献')}
                  </small>
                </div>
              ))}
            </div>
            <ContributionChart collection={collection} />
          </div>
          {resource.response && (
            <p className="profile-fetched">
              {t('上次读取')}
              {new Date(resource.response.fetchedAt).toLocaleString(locale)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
