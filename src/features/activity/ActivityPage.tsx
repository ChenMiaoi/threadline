import { useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { demoActivities } from './demo';
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
    note: '示例数据 · 已读状态仅保存在本地；不会向 GitHub 发送评论或评审。',
  },
  review: {
    title: '我审阅的 PR',
    description: '区分评审结论与评审后的代码变化',
    tabs: [
      ['updated', '需要复查 2'],
      ['waiting', '等待作者 3'],
      ['reviewed', '已评审 10'],
    ],
    note: '示例 SHA 仅用于说明版本追踪；评审结论、评论与最新代码版本分别展示。',
  },
  issues: {
    title: 'Issues',
    description: '关注你发起和参与的讨论',
    tabs: [
      ['open', '开放 8'],
      ['closed', '已关闭 3'],
      ['authored', '我发起的'],
      ['participated', '我参与的'],
    ],
    note: '示例数据 · “我参与的”表示曾评论或被提及；不会自动订阅或修改 Issue。',
  },
};

export function ActivityRecord({
  record,
  selected = false,
  onOpen,
  onRead,
  onSnooze,
  isRead,
}: {
  record: Activity;
  selected?: boolean;
  onOpen: (record: Activity) => void;
  onRead?: (id: string) => void;
  onSnooze?: (id: string) => void;
  isRead?: boolean;
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
            {record.kind === 'issue' && record.id.startsWith('inbox') ? 'Issue ' : ''}#
            {record.number}&nbsp; {record.title}
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
  forceEmpty = false,
}: {
  view: ActivityView;
  read: string[];
  snoozed?: string[];
  onRead: (id: string) => void;
  onSnooze: (id: string) => void;
  onOpen: (record: Activity) => void;
  forceEmpty?: boolean;
}) {
  const settings = config[view];
  const [filter, setFilter] = useState(
    view === 'inbox' ? 'unread' : view === 'issues' ? 'open' : 'all',
  );
  const [query, setQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [attention, setAttention] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const unread = demoActivities.inbox.filter(
    (item) => !read.includes(item.id) && !snoozed.includes(item.id),
  ).length;
  const records =
    forceEmpty && filter === 'unread'
      ? []
      : filterActivities(demoActivities[view], filter, query, read, snoozed).filter(
          (record) =>
            !attention ||
            record.category === 'attention' ||
            record.category === 'updated' ||
            record.tone === 'blue',
        );
  return (
    <>
      <header className="location">
        <span>llvm-project</span>
        <span className="separator">/</span>
        <span className="muted">{settings.title}</span>
        <span className="connection-badge small-badge">示例 · 未连接 GitHub</span>
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
              {id === 'unread' ? ` ${unread}` : ''}
            </button>
          ))}
          {view === 'issues' && (
            <button
              className="chip"
              aria-pressed={query === 'bug'}
              onClick={() => {
                setQuery(query === 'bug' ? '' : 'bug');
                setSearchVisible(true);
              }}
            >
              标签
            </button>
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
        {groupActivities(records).map(([group, items]) => (
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
        ))}
        {!records.length && (
          <section className="activity-empty">
            <div className="empty-symbol">✓</div>
            <h1>当前筛选下没有未读更新</h1>
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
                }}
              >
                清除筛选
              </button>
            </div>
            <div className="context-card">
              <h2>空列表不代表连接成功</h2>
              <p>当前展示示例工作区。你可以查看全部记录，或调整筛选条件。</p>
            </div>
          </section>
        )}
      </div>
      <footer className="page-note">{settings.note}</footer>
    </>
  );
}
