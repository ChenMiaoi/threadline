import { useState } from 'react';
import type { PullRequest } from './model';

export function PullDetailPage({ pull, onBack }: { pull: PullRequest; onBack: () => void }) {
  const [tab, setTab] = useState('discussion');
  const [notice, setNotice] = useState(false);
  const primary = pull.number === 1042;
  return (
    <>
      <header className="location">
        <button className="breadcrumb-button" onClick={onBack}>
          llvm-project
        </button>
        <span className="separator">/</span>
        <span className="muted">PR #{pull.number}</span>
        <span className="connection-badge">示例 · 未连接 GitHub</span>
      </header>
      <section className="pr-summary">
        <h1>{pull.title}</h1>
        <div className="inline-group">
          <span className="chip accent">#{pull.number}</span>
          <span className="chip green">开放</span>
          <span className="muted">作者：我 · llvm-project · {primary ? 3 : 1} 个提交</span>
        </div>
        <div className="inline-group branch-summary">
          <span className="dim">
            {primary ? 'fix/leading-space' : `sample/pr-${pull.number}`} → main
          </span>
          {primary && <span className="green">+48 −12 · 3 个文件</span>}
          <button className="chip accent" onClick={() => setNotice(!notice)}>
            在 GitHub 中查看 ↗
          </button>
        </div>
        {notice && (
          <p className="inline-notice" role="status">
            这是示例 PR，未关联真实 GitHub 记录。
          </p>
        )}
      </section>
      <div className="detail-tabs" role="tablist" aria-label="PR 详情">
        {[
          ['discussion', '讨论 5'],
          ['files', '文件变更 3'],
          ['checks', '检查 6'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`chip ${tab === id ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="detail-columns">
        <section className="detail-timeline">
          {tab === 'discussion' ? (
            <>
              <article className="detail-card">
                <h2>说明</h2>
                <p>
                  {primary
                    ? '在保留空白的词法分析模式下，保留 token 的 leading-space 标记。'
                    : pull.title}
                </p>
                <p>
                  {primary
                    ? '补充回归测试，避免源码位置信息在边界情况下丢失。'
                    : '此示例用于展示 PR 详情与状态。'}
                </p>
              </article>
              <article className="detail-card formal-review">
                <div className="inline-group">
                  <h2>Reviewer A</h2>
                  <span className="yellow">请求修改 · 正式评审</span>
                  <time className="dim">12 分钟前</time>
                </div>
                <p>请确认保留空白模式下的行为。这个分支是否会改变 escaped newline 的处理？</p>
                <small>评审版本 a1b2c3d · 当前 HEAD a1b2c3d</small>
              </article>
              <article className="detail-card">
                <div className="inline-group">
                  <h2>Reviewer B</h2>
                  <span className="muted">普通评论</span>
                  <time className="dim">1 小时前</time>
                </div>
                <p>测试覆盖看起来不错，可以再加一个包含宏展开的例子。</p>
              </article>
              <p className="footnote">此处仅展示讨论与评审记录。回复、提交评审请前往 GitHub。</p>
            </>
          ) : tab === 'files' ? (
            <article className="detail-card">
              <h2>文件变更</h2>
              {[
                'clang/lib/Lex/Lexer.cpp',
                'clang/include/clang/Lex/Lexer.h',
                'clang/test/Lexer/leading-space.c',
              ].map((file) => (
                <div className="file-record" key={file}>
                  <code>{file}</code>
                  <span className="green">+16 −4</span>
                </div>
              ))}
              <p className="dim">示例数据未包含完整代码差异。</p>
            </article>
          ) : (
            <article className="detail-card">
              <h2>检查</h2>
              {['clang-tests', 'build', 'lint', 'windows-build', 'linux-build', 'format'].map(
                (check) => (
                  <div className="file-record" key={check}>
                    <span>{check}</span>
                    <span className="green">✓ 通过</span>
                  </div>
                ),
              )}
            </article>
          )}
        </section>
        <aside className="detail-aside">
          <section className="detail-card">
            <h2>评审</h2>
            <p className="yellow">● 需要修改</p>
            <p>
              Reviewer A · 请求修改
              <br />
              Reviewer B · 仅评论，未正式评审
            </p>
            <small>评审与 HEAD 一致：a1b2c3d</small>
          </section>
          <section className="detail-card">
            <h2>检查</h2>
            <p className="green">✓ 6 / 6 检查通过</p>
            <p>
              clang-tests · build · lint
              <br />
              当前 HEAD a1b2c3d
            </p>
          </section>
          <section className="detail-card">
            <h2>文件变更</h2>
            <p className="file-list">
              clang/lib/Lex/Lexer.cpp
              <br />
              clang/include/clang/Lex/Lexer.h
              <br />
              clang/test/Lexer/leading-space.c
            </p>
            <p className="green">+48 −12 · 3 个文件</p>
          </section>
        </aside>
      </div>
      <footer className="page-note">
        示例数据 · 界面未连接 GitHub；不提供自动批准、合并或发布操作。
      </footer>
    </>
  );
}
