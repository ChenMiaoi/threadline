import { useI18n } from '../../i18n/I18n';
import { githubErrorMessage } from '../../lib/github-errors';
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { GitHubWorkspace } from '../../lib/useGitHub';
import { GitHubLoginButton } from './GitHubLogin';

export function GitHubConnection({
  github,
  onChoose,
}: {
  github: GitHubWorkspace;
  onChoose: () => void;
}) {
  const { t } = useI18n();

  const step = github.session ? (github.repo ? 3 : 2) : 1;
  return (
    <>
      <header className="location">
        <span>ThreadLine</span>
        <span className="separator">/</span>
        <span className="muted">{t('连接 GitHub')}</span>
      </header>
      <section className="onboarding-page">
        <h1>{t('连接你的 GitHub 协作空间')}</h1>
        <p className="muted">{t('把需要你处理的 PR、评审更新和 Issue 讨论放在一起。')}</p>
        <div className="connection-steps" aria-label={t('连接步骤')}>
          {['连接 GitHub', '选择仓库', '查看工作区'].map((label, index) => (
            <span key={label} className={`chip ${step === index + 1 ? 'active' : ''}`}>
              {index + 1}&nbsp;{t(label)}
            </span>
          ))}
        </div>
        <section className="connection-explanation">
          <h2>
            {github.session ? t('已连接 @{0}', [github.session.user.login]) : t('登录 GitHub')}
          </h2>
          <p>{t('连接 GitHub 后，选择你关注的仓库并查看协作更新。')}</p>
          {github.connecting ? (
            <p role="status">{t('正在检查 ThreadLine 登录状态…')}</p>
          ) : github.session ? (
            <button className="chip accent" onClick={onChoose}>
              {github.repo ? t('切换仓库') : t('选择仓库')}
            </button>
          ) : null}
          <GitHubLoginButton github={github} />
          {!github.session && !github.connecting && (
            <button className="chip" onClick={() => void github.connect()}>
              {t('重新检查连接')}
            </button>
          )}
          {github.connectionError && (
            <p role="alert" className="yellow">
              {githubErrorMessage(github.connectionError)}
            </p>
          )}
          {/GH_(VAULT_INVALID|SECURE_STORAGE)/.test(github.connectionError) && (
            <div>
              <p className="dim">{t('这会清除本机保存的登录凭据，之后需要重新授权。')}</p>
              <button className="chip" onClick={() => void github.disconnect()}>
                {t('清除本机登录并重新授权')}
              </button>
            </div>
          )}
        </section>
      </section>
    </>
  );
}

export function RepositoryPicker({
  github,
  onClose,
  onSelected,
}: {
  github: GitHubWorkspace;
  onClose: () => void;
  onSelected: () => void;
}) {
  const { t } = useI18n();

  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState(github.repo);
  const [error, setError] = useState('');
  const rows = github.repositories.filter((repo) =>
    repo.full_name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Modal className="repository-modal" title={t('选择仓库')} onClose={onClose}>
      <form
        className="repository-picker"
        onSubmit={(event) => {
          event.preventDefault();
          void github
            .selectRepository(choice)
            .then(onSelected)
            .catch((reason) => setError(String(reason)));
        }}
      >
        <p className="dim">
          @{github.session?.user.login} {t('· 选择工作仓库，或输入公开仓库名称')}
        </p>
        <input
          aria-label={t('搜索仓库')}
          placeholder={t('搜索仓库')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {github.picking && <p role="status">{t('正在读取 GitHub 仓库…')}</p>}
        {(error || github.repositoryError) && (
          <p role="alert" className="yellow">
            {githubErrorMessage(error || github.repositoryError)}
          </p>
        )}
        <div className="repository-options" role="radiogroup" aria-label={t('可选仓库')}>
          {rows.map((repo) => (
            <label className="repository-choice" key={repo.id}>
              <input
                type="radio"
                name="repository"
                value={repo.full_name}
                checked={choice === repo.full_name}
                onChange={() => setChoice(repo.full_name)}
              />
              <span>
                {repo.full_name}
                {repo.full_name === github.repo && <small className="accent"> {t('· 当前')}</small>}
              </span>
              <span className="dim">{repo.private ? t('私有') : t('公开')}</span>
            </label>
          ))}
        </div>
        {!github.picking && !rows.length && (
          <p>{t('没有匹配的仓库。可输入公开仓库完整名称，或为私有仓库添加授权后刷新列表。')}</p>
        )}
        <label>
          {t('仓库完整名称')}
          <input
            aria-label={t('仓库完整名称')}
            placeholder="owner/repository"
            value={choice}
            onChange={(event) => setChoice(event.target.value.trim())}
            required
            pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+"
          />
        </label>
        <div className="inline-group repository-picker-footer">
          <button
            type="button"
            className="chip"
            disabled={github.picking}
            onClick={() => void github.listRepositories()}
          >
            {t('刷新仓库列表')}
          </button>
          <button type="submit" className="chip accent" disabled={github.picking || !choice}>
            {t('打开仓库')}
          </button>
        </div>
        {github.session?.installationUrl && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void github.gateway
                .open(github.session!.installationUrl!)
                .catch((reason) => setError(String(reason)))
            }
          >
            {t('添加私有仓库权限 ↗')}
          </button>
        )}
      </form>
    </Modal>
  );
}
