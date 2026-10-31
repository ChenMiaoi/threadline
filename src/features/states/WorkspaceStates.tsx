import { FloatingWarning } from '../../components/FloatingWarnings';
import { useI18n } from '../../i18n/I18n';
import { useMemo, useState } from 'react';
import { snoozeActivityIndex } from './snoozed-model';
import { ActivityRecord } from '../activity/ActivityPage';
import type { Activity } from '../activity/model';
import { nextMorning, type WorkspaceData } from '../../core/workspace';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';

function StateLocation({ title }: { title: string }) {
  const { t } = useI18n();

  return <PageHeader title={t(title)} description={t('到时间后，动态会重新出现在收件箱')} />;
}

function formatDeadline(until: number) {
  const now = Date.now();
  return {
    day:
      until === nextMorning(now)
        ? '明天上午'
        : until === nextMorning(now, true)
          ? '下周一'
          : new Date(until).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    time: new Date(until).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

export function SnoozedPage({
  data,
  records,
  onRestore,
  onAdjust,
  onOpen,
}: {
  data: WorkspaceData;
  records: Activity[];
  onRestore: (ids: string[]) => void;
  onAdjust: (ids: string[]) => void;
  onOpen: (record: Activity) => void;
}) {
  const { t } = useI18n();

  const [recent, setRecent] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const recordIndex = useMemo(
    () => snoozeActivityIndex(records, data.snoozeRecords),
    [records, data.snoozeRecords],
  );
  const ids = useMemo(
    () =>
      recent
        ? data.restored
        : Object.keys(data.snoozed).sort((a, b) => data.snoozed[a] - data.snoozed[b]),
    [recent, data.restored, data.snoozed],
  );
  const visibleIds = useMemo(() => new Set(ids), [ids]);
  const resolved = useMemo(
    () => ids.map((id) => ({ id, record: recordIndex.get(id) })),
    [ids, recordIndex],
  );
  const rows = resolved
    .map(({ id, record }) => {
      if (!record) return undefined;
      const deadline = recent ? { day: '已恢复', time: '' } : formatDeadline(data.snoozed[id]);
      return { ...record, status: deadline.day, updated: deadline.time };
    })
    .filter((record): record is Activity => Boolean(record));
  const selection = useMemo(
    () => selected.filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );
  const selectionIds = useMemo(() => new Set(selection), [selection]);
  const snoozedCount = useMemo(
    () => Object.keys(data.snoozed).filter((id) => recordIndex.has(id)).length,
    [data.snoozed, recordIndex],
  );
  return (
    <>
      <StateLocation title={t('稍后处理')} />
      <section className="snoozed-page">
        <div className="inline-group" role="group" aria-label={t('稍后处理视图')}>
          <button
            aria-pressed={!recent}
            className={`chip ${!recent ? 'active' : ''}`}
            onClick={() => {
              setRecent(false);
              setSelected([]);
            }}
          >
            {t('已稍后处理')} {snoozedCount}
          </button>
          <button
            className={`chip ${recent ? 'active' : ''}`}
            aria-pressed={recent}
            onClick={() => {
              setRecent(true);
              setSelected([]);
            }}
          >
            {t('最近恢复')}
          </button>
        </div>
        <h2 className="cached-heading">{recent ? t('最近恢复的条目') : t('待恢复的条目')}</h2>
        <div className="snoozed-records">
          {rows.map((record) => (
            <div key={record.id} className="snooze-selection">
              <label className="snooze-checkbox">
                <input
                  type="checkbox"
                  aria-label={t('选择 #{0}', [record.number])}
                  checked={selectionIds.has(record.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(record.id)
                        ? current.filter((id) => id !== record.id)
                        : [...current, record.id],
                    )
                  }
                />
              </label>
              <ActivityRecord
                record={record}
                showKind
                selected={selectionIds.has(record.id)}
                onOpen={onOpen}
              />
            </div>
          ))}
          {!rows.length && (
            <p className="list-empty">
              {recent ? t('暂无最近恢复的条目。') : t('没有稍后处理的条目。')}
            </p>
          )}
        </div>
        {!recent && rows.length > 0 && (
          <div className="inline-group">
            <button
              className="chip accent"
              disabled={!selection.length}
              onClick={() => {
                onRestore(selection);
                setSelected([]);
              }}
            >
              {t('恢复选中条目')}
            </button>
            <button
              className="chip"
              disabled={!selection.length}
              onClick={() => onAdjust(selection)}
            >
              {t('调整时间')}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

export function SnoozeDialog({
  count,
  onConfirm,
  onClose,
}: {
  count: number;
  onConfirm: (until: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [choice, setChoice] = useState('tomorrow');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title={t('稍后处理')} onClose={onClose}>
      <form
        className="snooze-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const now = Date.now();
          const until =
            choice === 'hour'
              ? now + 3600000
              : choice === 'tomorrow'
                ? nextMorning(now)
                : choice === 'monday'
                  ? nextMorning(now, true)
                  : new Date(custom).getTime();
          if (!Number.isFinite(until) || until <= now) {
            setError('请选择未来的时间。');
            return;
          }
          onConfirm(until);
        }}
      >
        <p>
          {t('为')}
          {count} {t('个条目选择恢复时间。')}
        </p>
        {[
          ['hour', '1 小时后'],
          ['tomorrow', '明天上午 09:00'],
          ['monday', '下周一 09:00'],
          ['custom', '自定义时间'],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="snooze-time"
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
            />
            {t(label)}
          </label>
        ))}
        {choice === 'custom' && (
          <input
            type="datetime-local"
            aria-label={t('恢复时间')}
            required
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
        )}
        {error && (
          <FloatingWarning title={t('操作未完成')}>
            <p>{t(error)}</p>
          </FloatingWarning>
        )}
        <div className="inline-group">
          <button type="button" className="chip" onClick={onClose}>
            {t('取消')}
          </button>
          <button type="submit" className="chip accent">
            {t('保存时间')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
