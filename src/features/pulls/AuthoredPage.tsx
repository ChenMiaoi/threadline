import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { PullLifecycleIcon } from '../../components/PullLifecycleIcon';
import { PullStatusBadges } from '../../components/PullStatusBadges';
import { Icon, IconButton } from '../../components/Icon';
import { filterPullRequests, groupPullRequests, type PullRequest, type PullState } from './model';

export function AuthoredPage({
  onOpen,
  read,
  onRead,
  pulls,
  repo,
}: {
  onOpen: (pull: PullRequest) => void;
  read: string[];
  onRead: (id: string) => void;
  pulls: PullRequest[];
  repo: string;
}) {
  const [state, setState] = useState<PullState>('open');
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const rows = useMemo(
    () => filterPullRequests(pulls, state, query, attentionOnly),
    [pulls, state, query, attentionOnly],
  );
  const groups = useMemo(() => groupPullRequests(rows), [rows]);

  const selected = rows.find((p) => p.number === selectedNumber);
  const previewVisible = panelVisible && Boolean(selected);
  const preview = useRef<HTMLElement>(null);
  const selectedRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (previewVisible) preview.current?.focus();
  }, [previewVisible, selectedNumber]);
  function clearSelection() {
    setSelectedNumber(null);
    setPanelVisible(false);
  }
  function closePreview() {
    setPanelVisible(false);
    selectedRow.current?.focus();
  }

  return (
    <div className="authored-page">
      <PageHeader title="我发起的 PR" description={repo}>
        <div className="location-tools">
          <IconButton
            name="filter"
            label="仅显示需要处理的 PR"
            pressed={attentionOnly}
            onClick={() => {
              setAttentionOnly(!attentionOnly);
              clearSelection();
            }}
          />
          <IconButton
            name="panel"
            label="显示 PR 预览"
            disabled={!selected}
            pressed={previewVisible}
            onClick={() => setPanelVisible(!panelVisible)}
          />
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="搜索 PR"
              placeholder="搜索 PR..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                clearSelection();
              }}
            />
          </label>
        </div>
      </PageHeader>
      <div className="pull-tabs" role="tablist" aria-label="PR 状态">
        {(
          [
            ['open', '未结束'],
            ['merged', '已合并'],
            ['closed', '已关闭（未合并）'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={state === id}
            className={state === id ? 'active' : ''}
            onClick={() => {
              setState(id);
              clearSelection();
            }}
          >
            {label}
            <span>{pulls.filter((p) => p.state === id).length}</span>
          </button>
        ))}
      </div>
      <div className={`authored-workspace${previewVisible ? ' has-preview' : ''}`}>
        <section className="pull-list" aria-label="我发起的 PR">
          {groups.map(([group, pulls]) => (
            <section key={group}>
              <h2 className="pull-group-heading">
                {group}
                <span>{pulls.length}</span>
              </h2>
              {pulls.map((pull) => (
                <button
                  key={pull.number}
                  className={`pull-row ${selected?.number === pull.number ? 'selected' : ''}`}
                  aria-pressed={selected?.number === pull.number}
                  onClick={(event) => {
                    selectedRow.current = event.currentTarget;
                    setSelectedNumber(pull.number);
                    setPanelVisible(true);
                  }}
                  onDoubleClick={() => onOpen(pull)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onOpen(pull);
                    }
                  }}
                >
                  <PullLifecycleIcon
                    status={
                      pull.presentation ?? { state: pull.state, draft: pull.group === '草稿' }
                    }
                  />
                  <span className="pull-number">#{pull.number}</span>
                  <span className="pull-body">
                    <span className="pull-title" title={pull.title}>
                      {pull.title}
                    </span>
                    {pull.presentation ? (
                      <>
                        <PullStatusBadges status={pull.presentation} compact />
                        <span className="pull-next-action">
                          下一步：{pull.presentation.nextAction}
                          {pull.reviewer && (
                            <span className="requested-reviewer"> · 评审请求：{pull.reviewer}</span>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className={`pull-status ${pull.tone}`}>{pull.status}</span>
                    )}
                  </span>
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
                  clearSelection();
                }}
              >
                清除筛选
              </button>
            </div>
          )}
        </section>
        {previewVisible && selected && (
          <aside
            className="pr-preview"
            aria-label="PR 预览"
            ref={preview}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closePreview();
              }
            }}
          >
            <div className="pr-preview-heading">
              <Icon name="comment" />
              <h2>PR 预览</h2>
              <span className="accent">·&nbsp; #{selected.number}</span>
              <IconButton name="close" label="关闭 PR 预览" onClick={closePreview} />
            </div>
            <h3 className="pr-preview-title">{selected.title}</h3>
            <p className="pr-preview-source">来自上次同步的描述或评论摘要。</p>
            <div className="reviewer-message">
              <span className="avatar" title={selected.previewAuthor ?? selected.author}>
                {(selected.previewAuthor ?? selected.author)?.slice(0, 1).toUpperCase() ?? '—'}
              </span>
              <div>
                <p>
                  {selected.previewAuthor ?? selected.author} · {selected.status} ·{' '}
                  {selected.updated}
                </p>
                <p>{selected.summary || '暂无描述或评论摘要'}</p>
              </div>
            </div>
            <div className="pr-preview-actions">
              <button className="outline-button" onClick={() => onOpen(selected)}>
                打开完整详情
                <Icon name="arrow" />
              </button>
              <button
                className="text-button"
                onClick={() => onRead(selected.id ?? '')}
                disabled={read.includes(selected.id ?? '')}
              >
                <Icon name="mark-read" />
                {read.includes(selected.id ?? '') ? '已读' : '标记已读'}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
