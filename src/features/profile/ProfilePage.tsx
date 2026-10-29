import { useState } from 'react';
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
          <h1 id="profile-heading">个人主页</h1>
          <p>你在当前仓库的 GitHub 年度贡献</p>
        </div>
        <button className="chip" disabled={resource.loading} onClick={resource.retry}>
          刷新个人主页
        </button>
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
          在 GitHub 查看
        </button>
      </div>
      <div className="profile-period">
        <div>
          <h2>贡献活动</h2>
          <p>当前仓库 · {repo}</p>
        </div>
        <label>
          年份{' '}
          <select
            aria-label="贡献年份"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {resource.loading && <p role="status">正在读取 {year} 年 GitHub 贡献…</p>}
      {resource.error && (
        <div className="profile-error" role="alert">
          <p>暂时无法更新个人主页：{resource.error}</p>
          {profile && <p>当前显示上次读取的数据，可能不是最新。</p>}
          <button className="chip" onClick={resource.retry}>
            重试个人主页
          </button>
        </div>
      )}
      {collection && calendar && (
        <>
          <div className="contribution-card">
            <h3>
              {year} 年共 {calendar.totalContributions.toLocaleString('zh-CN')} 次贡献
            </h3>
            <div
              className="contribution-scroll"
              tabIndex={0}
              aria-label={`${year} 年每日贡献日历，使用方向键选择日期`}
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
              <div className="contribution-calendar" role="list" aria-label="每日 GitHub 贡献">
                <div className="contribution-week contribution-weekdays" aria-hidden="true">
                  <span style={{ gridRow: 3 }}>一</span>
                  <span style={{ gridRow: 5 }}>三</span>
                  <span style={{ gridRow: 7 }}>五</span>
                </div>
                {calendar.weeks.map((week, index) => (
                  <div className="contribution-week" key={index}>
                    <span className="contribution-month" aria-hidden="true">
                      {index === 0 || week.contributionDays.some((day) => day.date.endsWith('-01'))
                        ? `${Number(week.contributionDays.at(-1)?.date.slice(5, 7))}月`
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
                        aria-label={`${day.date}：${day.contributionCount} 次贡献`}
                        data-tooltip={`${day.date} · ${day.contributionCount} 次贡献`}
                        title={`${day.date}：${day.contributionCount} 次贡献`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <p id="contribution-selected-day" aria-live="polite">
              {activeDay
                ? `${activeDay.date}：${activeDay.contributionCount} 次贡献`
                : '该年度没有可显示的贡献日期'}
            </p>
            <div className="contribution-footer">
              <span>按当前仓库的 GitHub 贡献记录汇总</span>
              <div className="contribution-legend" aria-label="颜色由浅到深表示贡献由少到多">
                少{' '}
                {levels.map((level, index) => (
                  <span key={level} className={`contribution-day contribution-level-${index}`} />
                ))}{' '}
                多
              </div>
            </div>
          </div>
          <div className="profile-stats">
            {[
              ['提交', collection.totalCommitContributions],
              ['Issues', collection.totalIssueContributions],
              ['Pull requests', collection.totalPullRequestContributions],
              ['代码评审', collection.totalPullRequestReviewContributions],
            ].map(([label, value]) => (
              <div className="profile-stat" key={label}>
                <span>{label}</span>
                <strong>{Number(value).toLocaleString('zh-CN')}</strong>
                <small>{year} 年贡献</small>
              </div>
            ))}
          </div>
          <p className="profile-scope">
            仅统计当前账号在 {repo} 的提交、发起的 Issues、Pull requests 与代码评审贡献，日期使用
            UTC。代码评审遵循 GitHub 贡献规则，每个已评审 PR
            仅计最近一次评审。日历总数等于四项之和；无法归属当前仓库的受限贡献不计入。
          </p>
          {resource.response && (
            <p className="profile-fetched">
              上次读取 {new Date(resource.response.fetchedAt).toLocaleString('zh-CN')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
