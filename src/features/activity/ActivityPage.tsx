import { useI18n } from '../../i18n/I18n';
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
  const { t, locale } = useI18n();

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
                : t(record.summary)
              : record.summary}
          </span>
          {(!record.pullStatus ||
            showKind ||
            !['discussion', 'finished', 'draft'].includes(record.category)) && (
            <span className="record-detail" title={t(record.detail)}>
              {t(record.detail)}
            </span>
          )}
        </span>
        <span className="record-status">
          {(!record.pullStatus || onRead) && (
            <span className={record.tone}>
              {onRead ? (isRead ? t('已读') : t('未读')) : t(record.status)}
            </span>
          )}
          <time
            dateTime={record.updatedAt}
            title={record.updatedAt ? new Date(record.updatedAt).toLocaleString(locale) : undefined}
          >
            {record.updated}
          </time>
        </span>
      </button>
      {(onRead || onSnooze) && (
        <div className="record-actions">
          {onRead && (
            <button className="chip" onClick={() => onRead(record.id)}>
              {isRead ? t('标记未读') : t('标记已读')}
            </button>
          )}
          {onSnooze && (
            <button className="chip" onClick={() => onSnooze(record.id)}>
              {t('稍后处理')}
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
  onReadAll,
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
  onReadAll?: (ids: string[]) => void;
  onSnooze: (id: string) => void;
  onOpen: (record: Activity) => void;
  initialFilter?: string;
  items: Activity[];
  repo: string;
}) {
  const { t } = useI18n();

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
      <PageHeader title={t(settings.title)} description={repo}>
        <button
          className="chip"
          aria-label={t('仅显示需要处理的记录')}
          aria-pressed={attention}
          onClick={() => setAttention(!attention)}
        >
          {t('需处理')}
        </button>
        <label className="search-field activity-search">
          <Icon name="search" />
          <input
            aria-label={t('搜索协作记录')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('搜索标题、编号或内容')}
          />
        </label>
      </PageHeader>
      <div className="activity-controls">
        <div className="inline-group activity-filters">
          <TabList
            id={tabsId}
            label={t('{0}筛选', [t(settings.title)])}
            value={filter}
            onChange={setFilter}
            className="filter-tabs"
            tabClassName="chip"
            items={settings.tabs.map(([id, label]) => ({
              value: id,
              label: (
                <>
                  {t(label)}
                  {id === 'all' ? '' : ` ${counts[id]}`}
                </>
              ),
            }))}
          />
          {view === 'inbox' && onReadAll && (
            <button
              className="chip mark-all-read"
              disabled={!counts.unread}
              title={t('将当前仓库已加载的收件箱记录全部标为已读，不包含稍后处理')}
              onClick={() =>
                onReadAll(
                  items
                    .filter((item) => !readIds.has(item.id) && !snoozedIds.has(item.id))
                    .map((item) => item.id),
                )
              }
            >
              {t('全部标为已读')}
            </button>
          )}
          {view === 'issues' && (
            <select
              className="chip"
              aria-label={t('标签')}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            >
              <option value="">{t('全部标签')}</option>
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
              {t(group)}
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
                  ? t('当前筛选下没有未读更新')
                  : t('当前筛选下没有更新')
                : view === 'issues'
                  ? t('当前筛选下没有 Issue')
                  : t('当前筛选下没有 PR')}
            </h1>
            <div className="inline-group">
              <button className="chip accent" onClick={showAll}>
                {t('清除筛选并查看全部')}
              </button>
            </div>
          </section>
        )}
      </TabPanel>
    </>
  );
}
