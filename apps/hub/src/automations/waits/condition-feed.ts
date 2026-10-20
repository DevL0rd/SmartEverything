import {
  WEATHER_METRICS,
  jsonEquals,
  weatherMetricValue,
  type LiveChange,
} from '@smarteverything/domain';
import type { Cancel, Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';

const MINUTE_MS = 60_000;

const CLOCK_KEYS: readonly string[] = ['clock', 'clock:now', 'clock:minute'];

function nextMinute(now: number): number {
  return (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS;
}

function stateKeys(change: Extract<LiveChange, { table: 'device_state' }>): readonly string[] {
  const { record, oldRecord } = change;
  if (record === null) return ['device'];
  if (oldRecord !== null && jsonEquals(oldRecord.value, record.value)) return [];
  return ['device', `device:${record.capability}`];
}

function weatherKeys(change: Extract<LiveChange, { table: 'weather' }>): readonly string[] {
  const before = change.oldRecord?.forecast ?? null;
  const after = change.record?.forecast ?? null;
  const moved = WEATHER_METRICS.filter(
    (metric) => weatherMetricValue(before, metric) !== weatherMetricValue(after, metric),
  );
  return moved.length === 0 ? [] : ['weather', ...moved.map((metric) => `weather:${metric}`)];
}

function valueKeys(change: Extract<LiveChange, { table: 'automation_values' }>): readonly string[] {
  const id = change.record?.id ?? change.oldRecord?.id;
  return id === undefined ? ['value:*'] : [`value:${id}`, 'value:*'];
}

const GROUP_TABLES: ReadonlySet<string> = new Set(['rooms', 'device_groups']);

const PRESENCE_TABLES: ReadonlySet<string> = new Set(['clients', 'profiles']);

export function keysOfChange(change: LiveChange): readonly string[] {
  if (change.table === 'device_state') return stateKeys(change);
  if (change.table === 'weather') return weatherKeys(change);
  if (change.table === 'automation_values') return valueKeys(change);
  if (change.table === 'state_history') return ['device:history'];
  if (change.table === 'devices') return ['device:status', 'device', 'group'];
  if (GROUP_TABLES.has(change.table)) return ['group'];
  return PRESENCE_TABLES.has(change.table) ? ['presence'] : [];
}

interface Waiter {
  readonly keys: readonly string[];
  readonly changed: () => void;
}

export class ConditionFeed {
  private readonly index = new Map<string, Set<Waiter>>();
  private readonly waiters = new Set<Waiter>();
  private readonly clocked = new Set<Waiter>();
  private unsubscribe: Cancel | undefined;
  private minuteTimer: Cancel | undefined;

  constructor(
    private readonly feed: Pick<ChangeFeed, 'subscribe'>,
    private readonly clock: Pick<Clock, 'now' | 'at'>,
  ) {}

  get listeners(): number {
    return this.unsubscribe === undefined ? 0 : 1;
  }

  get timers(): number {
    return this.minuteTimer === undefined ? 0 : 1;
  }

  get waiting(): number {
    return this.waiters.size;
  }

  watch(keys: readonly string[], changed: () => void): Cancel {
    const waiter: Waiter = { keys, changed };
    this.waiters.add(waiter);
    for (const key of keys) this.bucket(key).add(waiter);
    if (keys.some((key) => CLOCK_KEYS.includes(key))) this.clocked.add(waiter);
    this.unsubscribe ??= this.feed.subscribe((change) => {
      this.deliver(keysOfChange(change));
    });
    if (this.clocked.size > 0) this.minuteTimer ??= this.armMinute();
    return () => {
      this.release(waiter);
    };
  }

  private bucket(key: string): Set<Waiter> {
    const held = this.index.get(key);
    if (held !== undefined) return held;
    const created = new Set<Waiter>();
    this.index.set(key, created);
    return created;
  }

  private deliver(keys: readonly string[]): void {
    const hit = new Set<Waiter>();
    for (const key of keys) for (const waiter of this.index.get(key) ?? []) hit.add(waiter);
    this.wake(hit);
  }

  private wake(waiters: Iterable<Waiter>): void {
    for (const waiter of [...waiters]) if (this.waiters.has(waiter)) waiter.changed();
  }

  private armMinute(): Cancel {
    return this.clock.at(new Date(nextMinute(this.clock.now().getTime())), () => {
      this.minuteTimer = undefined;
      const due = [...this.clocked];
      if (due.length > 0) this.minuteTimer = this.armMinute();
      this.wake(due);
    });
  }

  private release(waiter: Waiter): void {
    for (const key of waiter.keys) {
      const held = this.index.get(key);
      held?.delete(waiter);
      if (held?.size === 0) this.index.delete(key);
    }
    this.waiters.delete(waiter);
    this.clocked.delete(waiter);
    if (this.clocked.size === 0) {
      this.minuteTimer?.();
      this.minuteTimer = undefined;
    }
    if (this.waiters.size === 0) {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    }
  }
}
