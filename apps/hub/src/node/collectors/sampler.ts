import {
  KEY_FRAME_INTERVAL_MS,
  SAMPLE_TOPICS,
  type HistoryColumns,
  type HistoryPolicy,
  type HistoryQuery,
  type NodeDemandTopics,
  type NodeSampleFrame,
  type SampleParts,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { FrameBuilder } from './frame-builder';
import { seriesOf } from './history-series';
import { HistoryStore } from './history-store';
import type { SampleTopic, Tick } from './tick';
import { messageOf } from '@smarteverything/logging';

const SLACK_MS = 50;
const SUMMARY_LOG_MS = 30_000;
const RECORDED: readonly SampleTopic[] = SAMPLE_TOPICS.filter((topic) => topic !== 'processes');

export type SampleReaders = {
  readonly [Topic in SampleTopic]: (tick: Tick) => NonNullable<SampleParts[Topic]> | null;
};

export interface SamplerOptions {
  readonly readers: SampleReaders;
  readonly policy: HistoryPolicy;
  readonly emit: (frame: NodeSampleFrame) => void;
  readonly now: () => number;
  readonly log: Logger;
}

export interface HistoryStats {
  readonly bytes: number;
  readonly series: number;
  readonly points: number;
}

interface Tally {
  ticks: number;
  recordTicks: number;
  busyMs: number;
  maxTickMs: number;
  frames: number;
  bytes: number;
  failures: number;
  unchanged: number;
  sent: Record<string, number>;
  since: number;
}

function emptyTally(since: number): Tally {
  return {
    ticks: 0,
    recordTicks: 0,
    busyMs: 0,
    maxTickMs: 0,
    frames: 0,
    bytes: 0,
    failures: 0,
    unchanged: 0,
    sent: {},
    since,
  };
}

function wantedBy(owners: Iterable<NodeDemandTopics>): Map<SampleTopic, number> {
  const wanted = new Map<SampleTopic, number>();
  for (const topics of owners) {
    for (const topic of SAMPLE_TOPICS) {
      const interval = topics[topic];
      if (interval !== undefined) {
        wanted.set(topic, Math.min(interval, wanted.get(topic) ?? interval));
      }
    }
  }
  return wanted;
}

function sameDemand(
  a: ReadonlyMap<SampleTopic, number>,
  b: ReadonlyMap<SampleTopic, number>,
): boolean {
  return a.size === b.size && [...a].every(([topic, interval]) => b.get(topic) === interval);
}

export class Sampler {
  private readonly owners = new Map<string, NodeDemandTopics>();
  private wanted = new Map<SampleTopic, number>();
  private readonly lastSent = new Map<SampleTopic, number>();
  private readonly failures = new Map<SampleTopic, string>();
  private readonly builder = new FrameBuilder();
  private readonly history: HistoryStore;
  private policy: HistoryPolicy;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private gridOrigin = 0;
  private nextRecordAt = 0;
  private lastKeyAt = 0;
  private needKey = true;
  private seq = 0;
  private tally: Tally;

  constructor(private readonly options: SamplerOptions) {
    this.policy = options.policy;
    this.history = new HistoryStore(options.policy);
    this.tally = emptyTally(options.now());
  }

  start(): void {
    this.running = true;
    this.gridOrigin = this.options.now();
    this.nextRecordAt = this.gridOrigin;
    this.options.log.info('node.sampler_started', {
      intervalMs: this.policy.interval_ms,
      windowMs: this.policy.window_ms,
    });
    this.schedule();
  }

  stop(): void {
    this.options.log.info('node.sampler_stopped', { points: this.history.points });
    this.running = false;
    this.clearTimer();
    this.history.clear();
    this.lastSent.clear();
    this.needKey = true;
  }

  demand(owner: string, topics: NodeDemandTopics): void {
    this.owners.set(owner, topics);
    this.applyDemand();
  }

  release(owner: string): void {
    this.owners.delete(owner);
    this.applyDemand();
  }

  poke(topic: SampleTopic): void {
    this.lastSent.delete(topic);
    this.schedule();
  }

  setPolicy(policy: HistoryPolicy): void {
    this.options.log.info('node.history_policy_changed', {
      intervalMs: policy.interval_ms,
      windowMs: policy.window_ms,
    });
    this.policy = policy;
    this.history.setPolicy(policy);
    this.gridOrigin = this.options.now();
    this.nextRecordAt = this.gridOrigin;
    this.schedule();
  }

  backfill(query: HistoryQuery): HistoryColumns {
    return this.history.backfill(query, this.options.now());
  }

  historyStats(): HistoryStats {
    return {
      bytes: this.history.bytes,
      series: this.history.seriesCount,
      points: this.history.points,
    };
  }

  private applyDemand(): void {
    const next = wantedBy(this.owners.values());
    if (sameDemand(this.wanted, next)) {
      return;
    }
    for (const topic of SAMPLE_TOPICS) {
      if (this.wanted.get(topic) !== next.get(topic)) {
        this.lastSent.delete(topic);
        this.builder.forget(topic);
      }
    }
    this.wanted = next;
    this.needKey = true;
    this.options.log.info('node.demand_changed', {
      topics: JSON.stringify(Object.fromEntries(next)),
      holders: this.owners.size,
    });
    this.schedule();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    this.clearTimer();
    if (!this.running) {
      return;
    }
    let next = this.nextRecordAt;
    for (const [topic, interval] of this.wanted) {
      next = Math.min(next, (this.lastSent.get(topic) ?? 0) + interval);
    }
    this.timer = setTimeout(
      () => {
        this.run();
      },
      Math.max(0, next - this.options.now()),
    );
  }

  private sendDue(topic: SampleTopic, at: number, key: boolean): boolean {
    const interval = this.wanted.get(topic);
    const last = this.lastSent.get(topic);
    return (
      interval !== undefined && (key || last === undefined || at + SLACK_MS >= last + interval)
    );
  }

  private run(): void {
    this.timer = null;
    const started = performance.now();
    const at = this.options.now();
    const record = at + SLACK_MS >= this.nextRecordAt;
    const key = this.needKey || at - this.lastKeyAt >= KEY_FRAME_INTERVAL_MS;
    const sending = SAMPLE_TOPICS.filter((topic) => this.sendDue(topic, at, key));
    const reading = record ? [...new Set([...RECORDED, ...sending])] : sending;
    const read = this.readAll(reading, { at, key });
    if (record) {
      this.history.record(at, seriesOf(read));
      const interval = this.policy.interval_ms;
      this.nextRecordAt =
        this.gridOrigin + (Math.floor((at - this.gridOrigin) / interval) + 1) * interval;
    }
    this.send(read, sending, at, key);
    this.count(record, performance.now() - started, at);
    this.schedule();
  }

  private readAll(topics: readonly SampleTopic[], tick: Tick): SampleParts {
    const read: SampleParts = {};
    for (const topic of topics) {
      try {
        const part = this.options.readers[topic](tick);
        this.failures.delete(topic);
        if (part !== null) {
          Object.assign(read, { [topic]: part });
        }
      } catch (cause) {
        this.failed(topic, cause);
      }
    }
    return read;
  }

  private failed(topic: SampleTopic, cause: unknown): void {
    this.tally.failures += 1;
    const reason = messageOf(cause);
    if (this.failures.get(topic) !== reason) {
      this.failures.set(topic, reason);
      this.options.log.error('node.sample_failed', cause, { topic });
    }
  }

  private send(read: SampleParts, sending: readonly SampleTopic[], at: number, key: boolean): void {
    const candidates: SampleParts = {};
    for (const topic of sending) {
      this.lastSent.set(topic, at);
      const part = read[topic];
      if (part !== undefined) {
        Object.assign(candidates, { [topic]: part });
      }
    }
    const parts = this.builder.changed(candidates, key);
    if (key) {
      this.needKey = false;
      this.lastKeyAt = at;
    }
    const names = SAMPLE_TOPICS.filter((topic) => parts[topic] !== undefined);
    this.tally.unchanged += Object.keys(candidates).length - names.length;
    if (names.length === 0) {
      return;
    }
    const frame: NodeSampleFrame = {
      type: 'sample',
      at: new Date(at).toISOString(),
      seq: this.seq,
      ...(key ? { key: true } : {}),
      parts,
    };
    this.seq += 1;
    this.tally.frames += 1;
    this.tally.bytes += JSON.stringify(frame).length;
    for (const name of names) {
      this.tally.sent[name] = (this.tally.sent[name] ?? 0) + 1;
    }
    this.options.emit(frame);
  }

  private count(record: boolean, elapsedMs: number, at: number): void {
    const tally = this.tally;
    tally.ticks += 1;
    tally.recordTicks += record ? 1 : 0;
    tally.busyMs += elapsedMs;
    tally.maxTickMs = Math.max(tally.maxTickMs, elapsedMs);
    if (at - tally.since < SUMMARY_LOG_MS) {
      return;
    }
    const { since, sent, ...rest } = tally;
    this.options.log.debug('node.sample_summary', () => ({
      ...rest,
      busyMs: Math.round(tally.busyMs * 10) / 10,
      maxTickMs: Math.round(tally.maxTickMs * 10) / 10,
      windowMs: at - since,
      partsSent: JSON.stringify(sent),
      history: JSON.stringify(this.historyStats()),
    }));
    this.tally = emptyTally(at);
  }
}
