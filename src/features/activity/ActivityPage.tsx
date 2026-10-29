import { useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { filterActivities, groupActivities, type Activity, type ActivityView } from './model';

const config = {
  inbox: {
    title: '收件箱',
    description: '先看需要你行动的更新',
    tabs: [
      ['unread', '未读'],
      ['all', '全部'],
      ['mentions', '提及我的'],
    ],
    note: 'GitHub 通知 · 已读与稍后处理仅保存在本地，不修改 GitHub 通知状态。',
  },
  review: {
    title: '我审阅的 PR',
    description: '区分评审结论与评审后的代码变化',
    tabs: [
      ['all', '全部'],
      ['updated', '需要复查'],
      ['waiting', '等待作者'],
      ['reviewed', '已评审'],
    ],
    note: '真实评审版本与当前 HEAD 分别展示；代码更新后需要重新复查。',
  },
  issues: {
    title: 'Issues',
    description: '关注你发起和参与的讨论',
    tabs: [
      ['open', '开放'],
      ['closed', '已关闭'],
      ['authored', '我发起的'],
      ['participated', '我参与的'],
    ],
    note: '展示与当前账号有关的 Issue；不会自动订阅或修改 Issue。',
  },
};

export function ActivityRecord({
  record,
  selected = false,
  onOpen,
  onRead,
  onSnooze,
  isRead,
  showKind = false,
}: {
  record: Activity;
  selected?: boolean;
  onOpen: (record: Activity) => void;
  onRead?: (id: string) => void;
  onSnooze?: (id: string) => void;
  isRead?: boolean;
  showKind?: boolean;
}) {
  return (
    <div className={`activity-record ${selected ? 'selected' : ''} ${isRead ? 'is-read' : ''}`}>
      <button className="record-main" onClick={() => onOpen(record)}>
        <span
          className={`record-dot ${isRead ? 'dim' : record.tone}`}
          aria-label={isRead ? '已读' : '未读'}
        >
          ●
        </span>
        <span className="record-body">
          <span className="record-title">
            {record.kind === 'issue' && (showKind || record.id.startsWith('inbox')) ? 'Issue ' : ''}
            #{record.number}&nbsp; {record.title}
          </span>
          <span className="record-summary">{record.summary}</span>
          <span className="record-detail">{record.detail}</span>
        </span>
        <span className="record-status">
          <span className={record.tone}>{record.status}</span>
          <time>{record.updated}</time>
        </span>
      </button>
      {(onRead || onSnooze) && (
        <div className="record-actions">
          {onRead && (
            <button className="chip" onClick={() => onRead(record.id)}>
              {isRead ? '标记未读' : '标记已读'}
            </button>
          )}
          {onSnooze && (
            <button className="chip" onClick={() => onSnooze(record.id)}>
              稍后处理
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityPage({
  view,
  read,
  snoozed = [],
  onRead,
  onSnooze,
  onOpen,
  initialFilter,
  items,
  repo,
}: {
  view: ActivityView;
  read: string[];
  snoozed?: string[];
  onRead: (id: string) => void;
  onSnooze: (id: string) => void;
  onOpen: (record: Activity) => void;
  initialFilter?: string;
  items: Activity[];
  repo: string;
}) {
  const settings = config[view];
  const [filter, setFilter] = useState(
    initialFilter ?? (view === 'inbox' ? 'unread' : view === 'issues' ? 'open' : 'all'),
  );
  const [query, setQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [attention, setAttention] = useState(false);
  const [label, setLabel] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const unread = items.filter(
    (item) => !read.includes(item.id) && !snoozed.includes(item.id),
  ).length;
  const records = filterActivities(items, filter, query, read, snoozed).filter(
    (record) =>
      !attention ||
      record.category === 'attention' ||
      record.category === 'updated' ||
      record.tone === 'blue',
  );
  return (
    <>
      <header className="location">
        <span>{repo}</span>
        <span className="separator">/</span>
        <span className="muted">{settings.title}</span>
        <span className="connection-badge small-badge">GitHub</span>
      </header>
      <div className="activity-controls">
        <div className="activity-title">
          <h1>{settings.title}</h1>
          <p>{settings.description}</p>
          <div className="activity-tools">
            <button
              className="chip"
              aria-pressed={attention}
              onClick={() => setAttention(!attention)}
            >
              筛选
            </button>
            <button
              className="chip"
              onClick={() => {
                setSearchVisible(!searchVisible);
                requestAnimationFrame(() => input.current?.focus());
              }}
            >
              搜索
            </button>
          </div>
        </div>
        <div
          className="inline-group activity-filters"
          role="tablist"
          aria-label={`${settings.title}筛选`}
        >
          {settings.tabs.map(([id, label]) => (
            <button
              className={`chip ${filter === id ? 'active' : ''}`}
              role="tab"
              aria-selected={filter === id}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
              {id === 'all'
                ? ''
                : ` ${id === 'unread' ? unread : filterActivities(items, id, '', read, snoozed).length}`}
            </button>
          ))}
          {view === 'issues' && (
            <select
              className="chip"
              aria-label="标签"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            >
              <option value="">全部标签</option>
              {[...new Set(items.flatMap((item) => item.labels ?? []))].sort().map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          {searchVisible && (
            <label className="search-field activity-search">
              <Icon name="search" />
              <input
                ref={input}
                aria-label="搜索协作记录"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、编号或内容"
              />
            </label>
          )}
        </div>
      </div>
      <div className="activity-list">
        {groupActivities(records.filter((record) => !label || record.labels?.includes(label))).map(
          ([group, items]) => (
            <section key={group}>
              <h2 className="activity-group">
                {group}
                <span>{items.length}</span>
              </h2>
              {items.map((record, index) => (
                <ActivityRecord
                  key={record.id}
                  record={record}
                  selected={records[0]?.id === record.id && index === 0}
                  onOpen={onOpen}
                  onRead={view === 'inbox' ? onRead : undefined}
                  onSnooze={view === 'inbox' ? onSnooze : undefined}
                  isRead={read.includes(record.id)}
                />
              ))}
            </section>
          ),
        )}
        {!records.filter((record) => !label || record.labels?.includes(label)).length && (
          <section className="activity-empty">
            <div className="empty-symbol">✓</div>
            <h1>
              {view === 'inbox'
                ? '当前筛选下没有未读更新'
                : view === 'issues'
                  ? '当前筛选下没有 Issue'
                  : '当前筛选下没有 PR'}
            </h1>
            <p>没有条目需要你现在处理。你可以查看全部记录，或清除筛选。</p>
            <div className="inline-group">
              <button className="chip accent" onClick={() => setFilter('all')}>
                查看全部记录
              </button>
              <button
                className="chip"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                  setAttention(false);
                  setLabel('');
                }}
              >
                清除筛选
              </button>
            </div>
            <div className="context-card">
              <h2>当前仓库的协作记录</h2>
              <p>你可以查看全部记录，或调整筛选条件。同步失败时会单独显示错误。</p>
            </div>
          </section>
        )}
      </div>
      <footer className="page-note">{settings.note}</footer>
    </>
  );
}
