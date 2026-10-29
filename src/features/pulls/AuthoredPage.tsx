import { useState } from 'react';
import { Icon, IconButton } from '../../components/Icon';
import { demoPulls } from './demo';
import { filterPullRequests, groupPullRequests, type PullRequest, type PullState } from './model';

const checkIcons = {
  passed: 'check-passed',
  failed: 'check-failed',
  none: 'check-none',
  pending: 'check-pending',
};
const checkLabels = {
  passed: '检查通过',
  failed: '检查失败',
  none: '无检查',
  pending: '检查进行中',
};

export function AuthoredPage({ onOpen }: { onOpen: (pull: PullRequest) => void }) {
  const [state, setState] = useState<PullState>('open');
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const [selected, setSelected] = useState(demoPulls[0]);
  const [read, setRead] = useState<number[]>([]);
  const rows = filterPullRequests(demoPulls, state, query, attentionOnly);

  return (
    <>
      <header className="location pull-location">
        <Icon name="repo-heading" />
        <span>llvm-project</span>
        <span className="separator">/</span>
        <span className="muted">我发起的 PR</span>
        <div className="location-tools">
          <IconButton
            name="filter"
            label="仅显示需要处理的 PR"
            pressed={attentionOnly}
            onClick={() => setAttentionOnly(!attentionOnly)}
          />
          <IconButton
            name="panel"
            label="显示最新动态"
            pressed={panelVisible}
            onClick={() => setPanelVisible(!panelVisible)}
          />
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="搜索 PR"
              placeholder="搜索 PR..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </header>
      <div className="pull-tabs" role="tablist" aria-label="PR 状态">
        {(
          [
            ['open', '进行中', 12],
            ['merged', '已合并', 7],
            ['closed', '已关闭', 2],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={state === id}
            className={state === id ? 'active' : ''}
            onClick={() => setState(id)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      <section className="pull-list" aria-label="我发起的 PR">
        {groupPullRequests(rows).map(([group, pulls]) => (
          <section key={group}>
            <h2 className="pull-group-heading">
              {group}
              <span>{pulls.length}</span>
            </h2>
            {pulls.map((pull) => (
              <button
                key={pull.number}
                className={`pull-row ${selected.number === pull.number ? 'selected' : ''}`}
                onClick={() => {
                  setSelected(pull);
                  setPanelVisible(true);
                }}
                onDoubleClick={() => onOpen(pull)}
              >
                <Icon name="pr" />
                <span className="pull-number">#{pull.number}</span>
                <span className="pull-title">{pull.title}</span>
                <span className={`pull-status ${pull.tone}`}>●&nbsp; {pull.status}</span>
                <span title={checkLabels[pull.check]}>
                  <Icon name={checkIcons[pull.check]} />
                </span>
                <span className="avatar reviewer-avatar">{pull.reviewer}</span>
                <span className="row-time">{pull.updated}</span>
              </button>
            ))}
          </section>
        ))}
        {!rows.length && (
          <div className="list-empty">
            <h2>当前筛选下没有 PR</h2>
            <p>试试其他状态，或清除搜索与筛选。</p>
            <button
              className="chip"
              onClick={() => {
                setState('open');
                setQuery('');
                setAttentionOnly(false);
              }}
            >
              清除筛选
            </button>
          </div>
        )}
      </section>
      {panelVisible && (
        <section className="discussion-preview" aria-label="最新动态">
          <div className="discussion-heading">
            <Icon name="comment" />
            <h2>最新动态</h2>
            <span className="accent">·&nbsp; #{selected.number}</span>
            <IconButton name="close" label="关闭最新动态" onClick={() => setPanelVisible(false)} />
          </div>
          <div className="reviewer-message">
            <span className="avatar">{selected.reviewer}</span>
            <div>
              <p>
                Reviewer {selected.reviewer}{' '}
                {selected.number === 1042 ? '请求修改' : selected.status}&nbsp; ·&nbsp;{' '}
                {selected.updated === '12m' ? '12 分钟前' : selected.updated}
              </p>
              <p>{selected.number === 1042 ? '请确认保留空白模式下的行为。' : selected.title}</p>
            </div>
          </div>
          <div className="discussion-actions">
            <button className="outline-button" onClick={() => onOpen(selected)}>
              查看讨论
              <Icon name="arrow" />
            </button>
            <span className="separator">│</span>
            <button
              className="text-button"
              onClick={() => setRead([...read, selected.number])}
              disabled={read.includes(selected.number)}
            >
              <Icon name="mark-read" />
              {read.includes(selected.number) ? '已读' : '标记已读'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
