import { useState } from 'react';
import { ActivityRecord } from '../activity/ActivityPage';
import type { Activity } from '../activity/model';
import { nextMorning, type WorkspaceData } from '../../core/workspace';
import { Modal } from '../../components/Modal';

function StateLocation({ title }: { title: string }) {
  return (
    <header className="location">
      <span>ThreadLine</span>
      <span className="separator">/</span>
      <span className="muted">{title}</span>
      <span className="connection-badge">GitHub · 本地稍后处理</span>
    </header>
  );
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
  const [recent, setRecent] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const ids = recent
    ? data.restored
    : Object.keys(data.snoozed).sort((a, b) => data.snoozed[a] - data.snoozed[b]);
  const rows = ids
    .map((id) => {
      const record = records.find((record) => record.id === id) ?? data.snoozeRecords[id];
      if (!record) return undefined;
      const deadline = recent ? { day: '已恢复', time: '' } : formatDeadline(data.snoozed[id]);
      return { ...record, status: deadline.day, updated: deadline.time };
    })
    .filter((record): record is Activity => Boolean(record));
  const selection = selected.filter((id) => ids.includes(id));
  return (
    <>
      <StateLocation title="稍后处理" />
      <section className="snoozed-page">
        <h1>稍后处理</h1>
        <p className="muted">暂时移出关注范围，到时间后重新出现在工具收件箱。</p>
        <div className="inline-group">
          <button
            className={`chip ${!recent ? 'active' : ''}`}
            onClick={() => {
              setRecent(false);
              setSelected([]);
            }}
          >
            已稍后处理{' '}
            {
              Object.keys(data.snoozed).filter(
                (id) => records.some((r) => r.id === id) || data.snoozeRecords[id],
              ).length
            }
          </button>
          <button
            className={`chip ${recent ? 'active' : ''}`}
            onClick={() => {
              setRecent(true);
              setSelected([]);
            }}
          >
            最近恢复
          </button>
        </div>
        <h2 className="cached-heading">{recent ? '最近恢复的条目' : '待恢复的条目'}</h2>
        <div className="snoozed-records">
          {rows.map((record) => (
            <div key={record.id} className="snooze-selection">
              <label className="snooze-checkbox">
                <input
                  type="checkbox"
                  aria-label={`选择 #${record.number}`}
                  checked={selection.includes(record.id)}
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
                selected={selection.includes(record.id)}
                onOpen={onOpen}
              />
            </div>
          ))}
          {!rows.length && (
            <p className="list-empty">{recent ? '暂无最近恢复的条目。' : '没有稍后处理的条目。'}</p>
          )}
        </div>
        {!recent && (
          <div className="inline-group">
            <button
              className="chip accent"
              disabled={!selection.length}
              onClick={() => {
                onRestore(selection);
                setSelected([]);
              }}
            >
              恢复选中条目
            </button>
            <button
              className="chip"
              disabled={!selection.length}
              onClick={() => onAdjust(selection)}
            >
              调整时间
            </button>
          </div>
        )}
        <p className="footnote">
          时间与恢复状态保存在本地。到期条目会在下次打开工作区或检查时间时恢复；不会修改 GitHub
          状态。
        </p>
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
  const [choice, setChoice] = useState('tomorrow');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title="稍后处理" onClose={onClose}>
      <form
        className="snooze-form"
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
        <p>为 {count} 个条目选择恢复时间。</p>
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
            {label}
          </label>
        ))}
        {choice === 'custom' && (
          <input
            type="datetime-local"
            aria-label="恢复时间"
            required
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
        )}
        {error && (
          <p role="alert" className="yellow">
            {error}
          </p>
        )}
        <div className="inline-group">
          <button type="button" className="chip" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="chip accent">
            保存时间
          </button>
        </div>
      </form>
    </Modal>
  );
}
