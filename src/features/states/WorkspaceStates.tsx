import { useState } from 'react';
import { ActivityRecord } from '../activity/ActivityPage';
import { demoActivities } from '../activity/demo';
import type { Activity } from '../activity/model';
import { nextMorning, type WorkspaceData } from '../../core/workspace';
import { Modal } from '../../components/Modal';

function StateLocation({ title }: { title: string }) {
  return (
    <header className="location">
      <span>ThreadLine</span>
      <span className="separator">/</span>
      <span className="muted">{title}</span>
      <span className="connection-badge">示例 · 未连接 GitHub</span>
    </header>
  );
}

export function OnboardingPage({ onExample }: { onExample: () => void }) {
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState(false);
  return (
    <>
      <StateLocation title="首次连接" />
      <section className="onboarding-page">
        <h1>连接你的 GitHub 协作空间</h1>
        <p className="muted">把需要你处理的 PR、评审更新和 Issue 讨论放在一起。</p>
        <div className="connection-steps" aria-label="连接步骤">
          {['连接 GitHub', '选择仓库', '查看工作区'].map((label, index) => (
            <button
              className={`chip ${step === index + 1 ? 'active' : ''}`}
              key={label}
              aria-current={step === index + 1 ? 'step' : undefined}
              disabled={index + 1 > step}
              onClick={() => setStep(index + 1)}
            >
              {index + 1}&nbsp; {label}
            </button>
          ))}
        </div>
        <section className="connection-explanation">
          {step === 1 ? (
            <>
              <h2>在授权前，你始终可以查看请求范围</h2>
              <ul>
                <li>拟读取 PR、Issue、评论和正式评审信息</li>
                <li>实际权限与可访问仓库，以 GitHub 授权页为准</li>
                <li>本界面不会自动评论、批准、合并或修改代码</li>
              </ul>
              <div className="inline-group">
                <button className="chip accent" onClick={() => setNotice(true)}>
                  连接 GitHub ↗
                </button>
                <button className="chip" onClick={() => setStep(2)}>
                  先查看示例
                </button>
              </div>
              <p className="dim">你可以在授权完成前取消。当前未配置真实 GitHub 授权。</p>
              {notice && (
                <p className="inline-notice" role="status">
                  GitHub 授权尚未接入。请选择“先查看示例”体验工作区。
                </p>
              )}
            </>
          ) : step === 2 ? (
            <>
              <h2>选择示例仓库</h2>
              <p className="muted">当前仅展示示例仓库；未读取你的 GitHub 仓库。</p>
              <label className="repository-choice">
                <input type="radio" name="onboarding-repository" defaultChecked />
                llvm-project<span className="dim">示例仓库</span>
              </label>
              <div className="inline-group">
                <button className="chip" onClick={() => setStep(1)}>
                  返回
                </button>
                <button className="chip accent" onClick={() => setStep(3)}>
                  继续
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>工作区已准备好</h2>
              <p className="muted">以示例模式查看 PR、评审更新与 Issue 讨论。</p>
              <p className="dim">没有建立 GitHub 连接，所有协作记录均为示例。</p>
              <button className="outline-button" onClick={onExample}>
                打开示例工作区
              </button>
            </>
          )}
        </section>
        <p className="footnote">当前为首次连接示例：未创建 OAuth 会话、未获取令牌、未申请权限。</p>
      </section>
    </>
  );
}

export function EmptyInboxPage({ onShowAll }: { onShowAll: () => void }) {
  return (
    <>
      <StateLocation title="收件箱 / 空状态" />
      <section className="empty-inbox-page">
        <div className="empty-symbol">✓</div>
        <h1>当前筛选下没有未读更新</h1>
        <p className="muted">没有条目需要你现在处理。你可以查看全部记录，或清除筛选。</p>
        <div className="inline-group">
          <button className="chip accent" onClick={onShowAll}>
            查看全部记录
          </button>
          <button className="chip" onClick={onShowAll}>
            清除筛选
          </button>
        </div>
        <div className="context-card">
          <h2>空列表不代表连接成功</h2>
          <p>
            真实产品应分别展示「没有更新」「尚未连接」和「同步失败」。
            <br />
            当前仅演示已有列表中的空结果。
          </p>
        </div>
        <p className="footnote">示例状态 · 不代表实际仓库、通知或同步结果。</p>
      </section>
    </>
  );
}

export function SyncErrorPage({
  onConnect,
  onOpen,
}: {
  onConnect: () => void;
  onOpen: (record: Activity) => void;
}) {
  const [retried, setRetried] = useState(false);
  const cache = [demoActivities.inbox[0], demoActivities.inbox[2]].map((record, index) => ({
    ...record,
    summary: index === 0 ? '上次状态：请求修改 · 正式评审' : '上次状态：有新回复',
    detail:
      index === 0
        ? '示例缓存时间 09:41 · 当前网络恢复前不确认是否有新变化。'
        : '此处保留已显示信息，不把过期数据标记为同步成功。',
    tone: 'accent' as const,
    status: '待更新',
    updated: '09:41',
  }));
  return (
    <>
      <StateLocation title="同步失败" />
      <section className="sync-error-page">
        <h1>暂时无法更新工作区</h1>
        <div className="sync-error-banner" role="alert">
          <h2 className="yellow">● {retried ? '请先连接 GitHub' : '无法连接 GitHub'}</h2>
          <p>
            {retried
              ? '当前未建立 GitHub 连接。示例缓存仍会保留；请前往连接设置。'
              : '网络请求未完成。你可以检查连接后重试；之前展示的信息不会被清空。'}
          </p>
          <small>
            错误代码 {retried ? 'NOT_CONNECTED' : 'NETWORK_UNAVAILABLE'} · 以下时间与记录均为示例
          </small>
        </div>
        <div className="inline-group">
          <button className="chip accent" onClick={() => setRetried(true)}>
            重试同步
          </button>
          <button className="chip" onClick={onConnect}>
            查看连接设置
          </button>
        </div>
        <h2 className="cached-heading">上次显示的记录 · 可能不是最新</h2>
        <div className="cached-records">
          {cache.map((record) => (
            <ActivityRecord key={record.id} record={record} onOpen={onOpen} />
          ))}
        </div>
        <p className="footnote">此页面模拟未连接或网络失败；未运行同步请求，也未更改账号连接。</p>
      </section>
    </>
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

function snoozeRecord(id: string, until?: number): Activity | undefined {
  const number = Number(id.split('-').at(-1));
  const original = Object.values(demoActivities)
    .flat()
    .find((record) => record.number === number);
  if (!original) return undefined;
  const deadline = until ? formatDeadline(until) : { day: '已恢复', time: '' };
  return {
    ...original,
    id,
    summary: `${original.kind === 'issue' ? '参与的 Issue' : '普通评论回复'} · llvm-project`,
    detail:
      original.kind === 'issue'
        ? '可提前恢复，也可调整提醒时间。'
        : '稍后处理仅影响 ThreadLine 收件箱，不更改 GitHub 状态。',
    tone: 'accent',
    status: deadline.day,
    updated: deadline.time,
  };
}

export function SnoozedPage({
  data,
  onRestore,
  onAdjust,
  onOpen,
}: {
  data: WorkspaceData;
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
    .map((id) => snoozeRecord(id, recent ? undefined : data.snoozed[id]))
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
            已稍后处理 {Object.keys(data.snoozed).length}
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
