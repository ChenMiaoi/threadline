import { afterEach, expect, it, vi } from 'vitest';
import { createSyncScheduler, type SyncResult, type SyncState } from './sync-scheduler';

afterEach(() => vi.useRealTimers());

function setup(interval = 300_000) {
  vi.useFakeTimers();
  let online = true;
  const run = vi.fn<(_: boolean) => Promise<SyncResult>>().mockResolvedValue({ errors: [] });
  const states: SyncState[] = [];
  const scheduler = createSyncScheduler({
    interval,
    run,
    now: () => Date.now(),
    online: () => online,
    random: () => 0,
    schedule: (callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
    publish: (state) => states.push(state),
  });
  return { scheduler, run, states, setOnline: (value: boolean) => (online = value) };
}

it('schedules from completion and coalesces overlapping automatic and manual requests', async () => {
  const { scheduler, run } = setup(60_000);
  let finish!: (result: SyncResult) => void;
  run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  scheduler.start(true);
  await vi.advanceTimersByTimeAsync(0);
  const first = scheduler.refresh();
  const second = scheduler.refresh();
  await vi.advanceTimersByTimeAsync(180_000);
  expect(run).toHaveBeenCalledTimes(1);
  finish({ errors: [] });
  await Promise.all([first, second]);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(2);
  scheduler.stop();
});

it('retries transient failures with bounded exponential backoff and resets after success', async () => {
  const { scheduler, run, states } = setup();
  run.mockResolvedValue({ errors: ['GH_TIMEOUT'] });
  scheduler.start();
  await vi.advanceTimersByTimeAsync(0);
  for (const delay of [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
    const count = run.mock.calls.length;
    expect(states.at(-1)?.nextAttemptAt).toBe(Date.now() + delay);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(run).toHaveBeenCalledTimes(count);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(count + 1);
  }
  run.mockResolvedValue({ errors: [] });
  await scheduler.refresh();
  expect(states.at(-1)?.nextAttemptAt).toBe(Date.now() + 300_000);
  run.mockResolvedValue({ errors: ['GH_REQUEST_FAILED'] });
  await scheduler.refresh();
  expect(states.at(-1)?.nextAttemptAt).toBe(Date.now() + 30_000);
  scheduler.stop();
});

it('respects the server deadline across manual refresh, focus, and reconnect triggers', async () => {
  const { scheduler, run } = setup();
  const deadline = Date.now() + 600_000;
  run.mockResolvedValueOnce({ errors: [`GH_RATE_LIMIT: retryAt=${deadline}`] });
  await scheduler.refresh();
  await scheduler.refresh();
  scheduler.recover(true);
  await vi.advanceTimersByTimeAsync(599_999);
  scheduler.recover();
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(2);
  scheduler.stop();
});

it('pauses offline and resumes once without a focus-event request storm', async () => {
  const { scheduler, run, states, setOnline } = setup();
  setOnline(false);
  scheduler.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(run).not.toHaveBeenCalled();
  expect(states.at(-1)?.phase).toBe('offline');
  setOnline(true);
  scheduler.recover(true);
  scheduler.recover();
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  scheduler.recover();
  scheduler.recover();
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(2);
  setOnline(false);
  scheduler.offline();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(run).toHaveBeenCalledTimes(2);
  scheduler.stop();
});

it('stops automatic retries after access denial but permits an explicit retry', async () => {
  const { scheduler, run, states } = setup();
  run.mockResolvedValueOnce({ errors: ['GH_FORBIDDEN'] });
  await scheduler.refresh();
  expect(states.at(-1)?.phase).toBe('blocked');
  scheduler.recover(true);
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(run).toHaveBeenCalledTimes(1);
  await scheduler.refresh();
  expect(run).toHaveBeenCalledTimes(2);
  scheduler.stop();
});

it('does not publish or reschedule a request completing after disposal', async () => {
  const { scheduler, run, states } = setup();
  let finish!: (result: SyncResult) => void;
  run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const pending = scheduler.refresh();
  await vi.advanceTimersByTimeAsync(0);
  scheduler.stop();
  const count = states.length;
  finish({ errors: ['GH_TIMEOUT'] });
  await pending;
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(run).toHaveBeenCalledTimes(1);
  expect(states).toHaveLength(count);
});
