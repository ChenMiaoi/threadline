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
  const step = github.session ? (github.repo ? 3 : 2) : 1;
  return (
    <>
      <header className="location">
        <span>ThreadLine</span>
        <span className="separator">/</span>
        <span className="muted">连接 GitHub</span>
      </header>
      <section className="onboarding-page">
        <h1>连接你的 GitHub 协作空间</h1>
        <p className="muted">把需要你处理的 PR、评审更新和 Issue 讨论放在一起。</p>
        <div className="connection-steps" aria-label="连接步骤">
          {['连接 GitHub', '选择仓库', '查看工作区'].map((label, index) => (
            <span key={label} className={`chip ${step === index + 1 ? 'active' : ''}`}>
              {index + 1}&nbsp;{label}
            </span>
          ))}
        </div>
        <section className="connection-explanation">
          <h2>{github.session ? `已连接 @${github.session.user.login}` : '登录 GitHub'}</h2>
          <p>连接 GitHub 后，选择你关注的仓库并查看协作更新。</p>
          {github.connecting ? (
            <p role="status">正在检查 gh 登录状态…</p>
          ) : github.session ? (
            <button className="chip accent" onClick={onChoose}>
              {github.repo ? '切换仓库' : '选择仓库'}
            </button>
          ) : null}
          <GitHubLoginButton github={github} />
          {!github.session && !github.connecting && (
            <button className="chip" onClick={() => void github.connect()}>
              重新检查连接
            </button>
          )}
          {github.connectionError && (
            <p role="alert" className="yellow">
              {github.connectionError}
            </p>
          )}
        </section>
        <p className="footnote">仅使用读取接口；不会发送评论、提交评审、合并或修改 GitHub 订阅。</p>
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
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState(github.repo);
  const [error, setError] = useState('');
  const rows = github.repositories.filter((repo) =>
    repo.full_name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Modal title="选择仓库" onClose={onClose}>
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
        <p>当前账号 @{github.session?.user.login} · 仅显示可访问的仓库</p>
        <input
          aria-label="搜索仓库"
          placeholder="搜索仓库"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {github.picking && <p role="status">正在读取 GitHub 仓库…</p>}
        {(error || github.repositoryError) && (
          <p role="alert" className="yellow">
            {error || github.repositoryError}
          </p>
        )}
        <div className="repository-options">
          {rows.map((repo) => (
            <label className="repository-choice" key={repo.id}>
              <input
                type="radio"
                name="repository"
                value={repo.full_name}
                checked={choice === repo.full_name}
                onChange={() => setChoice(repo.full_name)}
              />
              <span>{repo.full_name}</span>
              <span className="dim">{repo.private ? '私有' : '公开'}</span>
            </label>
          ))}
        </div>
        {!github.picking && !rows.length && <p>没有匹配的仓库。也可以输入公开仓库的完整名称。</p>}
        <label>
          仓库完整名称
          <input
            aria-label="仓库完整名称"
            placeholder="owner/repository"
            value={choice}
            onChange={(event) => setChoice(event.target.value.trim())}
            required
            pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+"
          />
        </label>
        <div className="inline-group">
          <button
            type="button"
            className="chip"
            disabled={github.picking}
            onClick={() => void github.listRepositories()}
          >
            刷新仓库列表
          </button>
          <button type="submit" className="chip accent" disabled={github.picking || !choice}>
            打开仓库
          </button>
        </div>
      </form>
    </Modal>
  );
}
