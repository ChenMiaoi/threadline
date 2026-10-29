import { useI18n } from '../../i18n/I18n';
import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import { TabList, TabPanel } from '../../components/Tabs';
import { PageHeader } from '../../components/PageHeader';
import { PullLifecycleIcon } from '../../components/PullLifecycleIcon';
import { PullStatusBadges } from '../../components/PullStatusBadges';
import { Icon, IconButton } from '../../components/Icon';
import {
  filterPullRequests,
  groupPullRequests,
  pullStateCounts,
  type PullRequest,
  type PullState,
} from './model';

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
  const { t } = useI18n();

  const [state, setState] = useState<PullState>('open');
  const tabsId = useId();
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const rows = useMemo(
    () => filterPullRequests(pulls, state, query, attentionOnly),
    [pulls, state, query, attentionOnly],
  );
  const groups = useMemo(() => groupPullRequests(rows), [rows]);
  const counts = useMemo(() => pullStateCounts(pulls), [pulls]);
  const readIds = useMemo(() => new Set(read), [read]);

  const selected = rows.find((p) => p.number === selectedNumber);
  const previewVisible = panelVisible && Boolean(selected);
  const preview = useRef<HTMLElement>(null);
  const selectedRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (previewVisible) preview.current?.focus({ preventScroll: true });
  }, [previewVisible, selectedNumber]);
  useLayoutEffect(() => {
    if (!previewVisible) return;
    function positionPreview() {
      const row = selectedRow.current;
      const panel = preview.current;
      if (!row || !panel) return;
      // Floating previews occupy the roomier side of the source row, keeping
      // its pointer target stationary through the browser's double-click sequence.
      const bounds = row.getBoundingClientRect();
      const edge = 16;
      const gap = 8;
      const rowTop = Math.max(edge, Math.min(window.innerHeight - edge, bounds.top));
      const rowBottom = Math.max(edge, Math.min(window.innerHeight - edge, bounds.bottom));
      const above = Math.max(0, rowTop - edge - gap);
      const below = Math.max(0, window.innerHeight - rowBottom - edge - gap);
      const useBelow = below >= above;
      panel.style.setProperty(
        '--preview-top',
        useBelow ? `${Math.max(edge, rowBottom + gap)}px` : 'auto',
      );
      panel.style.setProperty(
        '--preview-bottom',
        useBelow ? 'auto' : `${Math.max(edge, window.innerHeight - rowTop + gap)}px`,
      );
      panel.style.setProperty('--preview-max-height', `${Math.max(above, below)}px`);
    }
    positionPreview();
    window.addEventListener('resize', positionPreview);
    window.addEventListener('scroll', positionPreview, true);
    return () => {
      window.removeEventListener('resize', positionPreview);
      window.removeEventListener('scroll', positionPreview, true);
    };
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
      <PageHeader title={t('我发起的 PR')} description={repo}>
        <div className="location-tools">
          <IconButton
            name="filter"
            label={t('仅显示需要处理的 PR')}
            pressed={attentionOnly}
            onClick={() => {
              setAttentionOnly(!attentionOnly);
              clearSelection();
            }}
          />
          <IconButton
            name="panel"
            label={t('显示 PR 预览')}
            disabled={!selected}
            pressed={previewVisible}
            onClick={() => setPanelVisible(!panelVisible)}
          />
          <label className="search-field">
            <Icon name="search" />
            <input
              data-search-pulls
              aria-label={t('搜索 PR')}
              placeholder={t('搜索 PR...')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                clearSelection();
              }}
            />
          </label>
        </div>
      </PageHeader>
      <TabList
        id={tabsId}
        label={t('PR 状态')}
        value={state}
        className="pull-tabs"
        onChange={(id) => {
          setState(id);
          clearSelection();
        }}
        items={(
          [
            ['open', '未结束'],
            ['merged', '已合并'],
            ['closed', '已关闭（未合并）'],
          ] as const
        ).map(([id, label]) => ({
          value: id,
          label: (
            <>
              {t(label)}
              <span>{counts[id]}</span>
            </>
          ),
        }))}
      />
      <TabPanel
        id={tabsId}
        value={state}
        className={`authored-workspace${previewVisible ? ' has-preview' : ''}`}
      >
        <section className="pull-list" aria-label={t('我发起的 PR')}>
          {groups.map(([group, pulls]) => (
            <section key={group}>
              <h2 className="pull-group-heading">
                {t(group)}
                <span>{pulls.length}</span>
              </h2>
              {pulls.map((pull) => (
                <div className="pull-list-entry" key={pull.number}>
                  <button
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
                          {pull.reviewer && (
                            <span
                              className="requested-reviewer"
                              title={t('评审请求：{0}', [pull.reviewer])}
                            >
                              {t('评审请求：')}
                              {pull.reviewer}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className={`pull-status ${pull.tone}`}>{t(pull.status)}</span>
                      )}
                    </span>
                    <span className="row-time">{pull.updated}</span>
                  </button>
                  <button
                    className="text-button pull-open-detail"
                    aria-label={t('打开 PR {0} 详情', [pull.number])}
                    onClick={() => onOpen(pull)}
                  >
                    {t('详情')}
                    <Icon name="arrow" />
                  </button>
                </div>
              ))}
            </section>
          ))}
          {!rows.length && (
            <div className="list-empty">
              <h2>{t('当前筛选下没有 PR')}</h2>
              <p>{t('试试其他状态，或清除搜索与筛选。')}</p>
              <button
                className="chip"
                onClick={() => {
                  setState('open');
                  setQuery('');
                  setAttentionOnly(false);
                  clearSelection();
                }}
              >
                {t('清除筛选')}
              </button>
            </div>
          )}
        </section>
        {previewVisible && selected && (
          <aside
            className="pr-preview"
            aria-label={t('PR 预览')}
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
              <h2>{t('PR 预览')}</h2>
              <span className="accent">·&nbsp; #{selected.number}</span>
              <IconButton name="close" label={t('关闭 PR 预览')} onClick={closePreview} />
            </div>
            <h3 className="pr-preview-title">{selected.title}</h3>
            <p className="pr-preview-source">{t('来自上次同步的描述或评论摘要。')}</p>
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
                {t('打开完整详情')}
                <Icon name="arrow" />
              </button>
              <button
                className="text-button"
                onClick={() => onRead(selected.id ?? '')}
                disabled={readIds.has(selected.id ?? '')}
              >
                <Icon name="mark-read" />
                {readIds.has(selected.id ?? '') ? t('已读') : t('标记已读')}
              </button>
            </div>
          </aside>
        )}
      </TabPanel>
    </div>
  );
}
