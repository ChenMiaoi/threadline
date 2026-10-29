import { useId, useMemo, useState } from 'react';
import { TabList, TabPanel } from '../../components/Tabs';
import { PullLifecycleIcon } from '../../components/PullLifecycleIcon';
import { PullStatusBadges } from '../../components/PullStatusBadges';
import { chronological } from '../../core/inbox';
import { PageHeader } from '../../components/PageHeader';
import { IssueIcon } from '../../components/IssueIcon';
import { Icon } from '../../components/Icon';
import {
  activityCounts,
  filterActivities,
  groupActivities,
  type Activity,
  type ActivityView,
} from './model';

const emptyIds: string[] = [];

const config = {
  inbox: {
    title: '收件箱',
    tabs: [
      ['unread', '未读'],
      ['all', '全部'],
      ['pull', 'PR'],
      ['issue', 'Issue'],
      ['mentions', '提及我的'],
    ],
    note: '当前仓库中与你有关的 PR / Issue · 每条显示最新动态 · 按同步频率更新，已读状态仅保存在本地。',
  },
  review: {
    title: '我审阅的 PR',
    tabs: [
      ['all', '全部'],
      ['requested', '待我评审'],
      ['updated', '评审后有新提交'],
      ['waiting', '等待作者修改'],
      ['reviewed', '我已批准'],
      ['draft', '草稿'],
      ['finished', '已结束'],
    ],
    note: '',
  },
  issues: {
    title: 'Issues',
    tabs: [
      ['all', '全部'],
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
        {record.pullStatus && <PullLifecycleIcon status={record.pullStatus} />}
        {!record.pullStatus &&
          (record.kind === 'pull' ? (
            <Icon name="pr" />
          ) : (
            <IssueIcon closed={record.state === 'closed'} />
          ))}
        <span className="record-body">
          <span className="record-title" title={record.title}>
            {showKind
              ? record.kind === 'pull'
                ? 'PR '
                : 'Issue '
              : record.kind === 'issue' && record.id.includes(':notification:')
                ? 'Issue '
                : ''}
            #{record.number}&nbsp; {record.title}
          </span>
          {record.pullStatus && !showKind && (
            <PullStatusBadges status={record.pullStatus} personal={record.personalReview} compact />
          )}
          <span className="record-summary">
            {record.pullStatus && !showKind
              ? ['discussion', 'finished', 'draft'].includes(record.category)
                ? record.detail
                : `下一步：${record.summary}`
              : record.summary}
          </span>
          {(!record.pullStatus ||
            showKind ||
            !['discussion', 'finished', 'draft'].includes(record.category)) && (
            <span className="record-detail" title={record.detail}>
              {record.detail}
            </span>
          )}
        </span>
        <span className="record-status">
          {(!record.pullStatus || onRead) && (
            <span className={record.tone}>
              {onRead ? (isRead ? '已读' : '未读') : record.status}
            </span>
          )}
          <time
            dateTime={record.updatedAt}
            title={
              record.updatedAt ? new Date(record.updatedAt).toLocaleString('zh-CN') : undefined
            }
          >
            {record.updated}
          </time>
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
  snoozed = emptyIds,
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
  const tabsId = useId();
  const [filter, setFilter] = useState(
    initialFilter ?? (view === 'inbox' ? 'unread' : view === 'issues' ? 'open' : 'all'),
  );
  const [query, setQuery] = useState('');
  const [attention, setAttention] = useState(false);
  const [label, setLabel] = useState('');
  function showAll() {
    setFilter('all');
    setQuery('');
    setAttention(false);
    setLabel('');
  }
  const readIds = useMemo(() => new Set(read), [read]);
  const snoozedIds = useMemo(() => new Set(snoozed), [snoozed]);
  const counts = useMemo(
    () =>
      activityCounts(
        items,
        settings.tabs.map(([id]) => id),
        readIds,
        snoozedIds,
      ),
    [items, settings, readIds, snoozedIds],
  );
  const labels = useMemo(
    () => [...new Set(items.flatMap((item) => item.labels ?? []))].sort(),
    [items],
  );
  const groups = useMemo(() => {
    const records = filterActivities(items, filter, query, readIds, snoozedIds).filter(
      (record) =>
        (!attention ||
          (record.needsAttention ??
            (record.category === 'attention' ||
              record.category === 'updated' ||
              record.tone === 'blue'))) &&
        (!label || record.labels?.includes(label)),
    );
    return view === 'inbox'
      ? records.length
        ? [['最新动态', chronological(records)] as [string, Activity[]]]
        : []
      : groupActivities(records);
  }, [items, filter, query, readIds, snoozedIds, attention, label, view]);
  return (
    <>
      <PageHeader title={settings.title} description={repo}>
        <button
          className="chip"
          aria-label="仅显示需要处理的记录"
          aria-pressed={attention}
          onClick={() => setAttention(!attention)}
        >
          需处理
        </button>
        <label className="search-field activity-search">
          <Icon name="search" />
          <input
            aria-label="搜索协作记录"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、编号或内容"
          />
        </label>
      </PageHeader>
      <div className="activity-controls">
        <div className="inline-group activity-filters">
          <TabList
            id={tabsId}
            label={`${settings.title}筛选`}
            value={filter}
            onChange={setFilter}
            className="filter-tabs"
            tabClassName="chip"
            items={settings.tabs.map(([id, label]) => ({
              value: id,
              label: (
                <>
                  {label}
                  {id === 'all' ? '' : ` ${counts[id]}`}
                </>
              ),
            }))}
          />
          {view === 'issues' && (
            <select
              className="chip"
              aria-label="标签"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            >
              <option value="">全部标签</option>
              {labels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <TabPanel id={tabsId} value={filter} className="activity-list">
        {groups.map(([group, items]) => (
          <section key={group}>
            <h2 className="activity-group">
              {group}
              <span>{items.length}</span>
            </h2>
            {items.map((record) => (
              <ActivityRecord
                key={record.id}
                record={record}
                showKind={view === 'inbox'}
                onOpen={onOpen}
                onRead={view === 'inbox' ? onRead : undefined}
                onSnooze={view === 'inbox' ? onSnooze : undefined}
                isRead={readIds.has(record.id)}
              />
            ))}
          </section>
        ))}
        {!groups.length && (
          <section className="activity-empty">
            <div className="empty-symbol">✓</div>
            <h1>
              {view === 'inbox'
                ? filter === 'unread'
                  ? '当前筛选下没有未读更新'
                  : '当前筛选下没有更新'
                : view === 'issues'
                  ? '当前筛选下没有 Issue'
                  : '当前筛选下没有 PR'}
            </h1>
            <p>当前筛选没有匹配记录。清除筛选后可查看全部记录。</p>
            <div className="inline-group">
              <button className="chip accent" onClick={showAll}>
                清除筛选并查看全部
              </button>
            </div>
          </section>
        )}
      </TabPanel>
      {settings.note && <footer className="page-note">{settings.note}</footer>}
    </>
  );
}
