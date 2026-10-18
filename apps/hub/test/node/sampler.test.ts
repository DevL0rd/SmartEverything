import { SAMPLE_TOPICS, type NodeSampleFrame } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sampler, type SampleReaders } from '../../src/node/collectors/sampler';
import type { SampleTopic, Tick } from '../../src/node/collectors/tick';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { CPU, SUMMARY } from './sample-parts';

const POLICY = { interval_ms: 1000, window_ms: 60_000 };

interface Rig {
  readonly sampler: Sampler;
  readonly frames: NodeSampleFrame[];
  readonly reads: Partial<Record<SampleTopic, number>>;
  readonly logs: CapturedLogs;
  readonly state: { load: number; broken: boolean };
}

function rig(policy = POLICY): Rig {
  const frames: NodeSampleFrame[] = [];
  const reads: Partial<Record<SampleTopic, number>> = {};
  const logs = captureLogs();
  const state = { load: 10, broken: false };
  const counted = <T>(topic: SampleTopic, make: (tick: Tick) => T): ((tick: Tick) => T) => {
    return (tick) => {
      reads[topic] = (reads[topic] ?? 0) + 1;
      return make(tick);
    };
  };
  const readers: SampleReaders = {
    summary: counted('summary', () => ({ ...SUMMARY, cpuLoad: state.load })),
    cpu: counted('cpu', () => {
      if (state.broken) {
        throw new Error('stat vanished');
      }
      return { ...CPU, load: state.load };
    }),
    gpu: counted('gpu', () => ({ gpus: [] })),
    memory: counted('memory', () => null),
    disks: counted('disks', () => ({ disks: [] })),
    network: counted('network', () => null),
    sensors: counted('sensors', () => ({ sensors: [], fans: [] })),
    power: counted('power', () => null),
    processes: counted('processes', () => ({ total: 1, offset: 0, order: [], rows: [] })),
  };
  const sampler = new Sampler({
    readers,
    policy,
    emit: (frame): void => {
      frames.push(frame);
    },
    now: (): number => Date.now(),
    log: testLogger('node'),
  });
  return { sampler, frames, reads, logs, state };
}

function partsOf(frame: NodeSampleFrame | undefined): string[] {
  return SAMPLE_TOPICS.filter((topic) => frame?.parts[topic] !== undefined);
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sampler recording', () => {
  it('records history every second although nobody watches and sends nothing', () => {
    const { sampler, frames, reads } = rig();
    sampler.start();
    vi.advanceTimersByTime(10_500);
    expect(frames).toEqual([]);
    expect(reads.summary).toBe(11);
    expect(sampler.historyStats().points).toBe(11);
    const history = sampler.backfill({ topics: ['summary', 'cpu'], maxPoints: 100, sinceMs: 0 });
    expect(history.timestamps).toHaveLength(11);
    expect(history.series.map((item) => item.topic)).toContain('cpu');
  });

  it('never reads processes for history', () => {
    const { sampler, reads } = rig();
    sampler.start();
    vi.advanceTimersByTime(5000);
    expect(reads.processes).toBeUndefined();
  });

  it('keeps only the configured window in memory', () => {
    const { sampler } = rig({ interval_ms: 1000, window_ms: 60_000 });
    sampler.start();
    vi.advanceTimersByTime(90_000);
    expect(sampler.historyStats().points).toBe(60);
  });

  it('follows a changed interval and window', () => {
    const { sampler } = rig();
    sampler.start();
    vi.advanceTimersByTime(5000);
    sampler.setPolicy({ interval_ms: 5000, window_ms: 60_000 });
    vi.advanceTimersByTime(20_000);
    const history = sampler.backfill({ topics: ['summary'], maxPoints: 100, sinceMs: 1_005_000 });
    expect(history.intervalMs).toBe(5000);
    const recent = history.timestamps.slice(-3);
    expect(recent.map((stamp, index) => stamp - (recent[index - 1] ?? stamp))).toEqual([
      0, 5000, 5000,
    ]);
  });

  it('forgets history when it is stopped', () => {
    const { sampler } = rig();
    sampler.start();
    vi.advanceTimersByTime(3000);
    sampler.stop();
    expect(sampler.historyStats().points).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(sampler.historyStats().points).toBe(0);
  });
});

describe('Sampler frames', () => {
  it('sends the first frame as a key frame with the demanded parts only', () => {
    const { sampler, frames } = rig();
    sampler.start();
    sampler.demand('hub', { summary: 1000, cpu: 1000 });
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ key: true, seq: 0 });
    expect(partsOf(frames[0])).toEqual(['summary', 'cpu']);
  });

  it('sends only parts whose value changed', () => {
    const { sampler, frames, state } = rig();
    sampler.start();
    sampler.demand('hub', { summary: 1000, cpu: 1000 });
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(1000);
    expect(frames).toHaveLength(1);
    state.load = 30;
    vi.advanceTimersByTime(1000);
    expect(frames).toHaveLength(2);
    expect(partsOf(frames[1])).toEqual(['summary', 'cpu']);
    expect(frames[1]?.key).toBeUndefined();
    expect(frames[1]?.seq).toBe(1);
  });

  it('reads and sends a slower demand only when due', () => {
    const { sampler, frames, reads } = rig();
    sampler.start();
    sampler.demand('baseline', { summary: 10_000 });
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(25_000);
    expect(reads.summary).toBeGreaterThanOrEqual(26);
    expect(frames).toHaveLength(1);
  });

  it('serves the fastest of several holders and slows down when one leaves', () => {
    const { sampler, frames, state } = rig();
    sampler.start();
    sampler.demand('baseline', { summary: 10_000 });
    sampler.demand('phone', { summary: 1000 });
    vi.advanceTimersByTime(0);
    frames.length = 0;
    for (const load of [20, 30, 40]) {
      state.load = load;
      vi.advanceTimersByTime(1000);
    }
    expect(frames).toHaveLength(3);
    sampler.release('phone');
    frames.length = 0;
    for (const load of [50, 60, 70]) {
      state.load = load;
      vi.advanceTimersByTime(1000);
    }
    expect(frames).toHaveLength(1);
  });

  it('stops sending a topic within one second of its demand ending', () => {
    const { sampler, frames, state } = rig();
    sampler.start();
    sampler.demand('hub', { cpu: 1000 });
    vi.advanceTimersByTime(3000);
    sampler.demand('hub', {});
    frames.length = 0;
    state.load = 99;
    vi.advanceTimersByTime(5000);
    expect(frames).toEqual([]);
  });

  it('sends a key frame again when the demand changes and every thirty seconds', () => {
    const { sampler, frames } = rig();
    sampler.start();
    sampler.demand('hub', { cpu: 1000 });
    vi.advanceTimersByTime(0);
    sampler.demand('hub', { cpu: 1000, gpu: 1000 });
    vi.advanceTimersByTime(0);
    expect(frames.filter((frame) => frame.key === true)).toHaveLength(2);
    vi.advanceTimersByTime(31_000);
    expect(frames.filter((frame) => frame.key === true).length).toBeGreaterThanOrEqual(3);
  });

  it('reads the processes topic only while demanded and on poke', () => {
    const { sampler, reads } = rig();
    sampler.start();
    vi.advanceTimersByTime(3000);
    expect(reads.processes).toBeUndefined();
    sampler.demand('hub', { processes: 1000 });
    vi.advanceTimersByTime(0);
    expect(reads.processes).toBe(1);
    sampler.poke('processes');
    vi.advanceTimersByTime(0);
    expect(reads.processes).toBe(2);
    sampler.demand('hub', {});
    vi.advanceTimersByTime(5000);
    expect(reads.processes).toBe(2);
  });

  it('does not number or send an empty frame', () => {
    const { sampler, frames } = rig();
    sampler.start();
    sampler.demand('hub', { memory: 1000 });
    vi.advanceTimersByTime(5000);
    expect(frames).toEqual([]);
  });
});

describe('Sampler failures', () => {
  it('keeps recording the other topics and logs the failure once', () => {
    const { sampler, logs, state } = rig();
    state.broken = true;
    sampler.start();
    vi.advanceTimersByTime(5500);
    expect(logs.events().filter((event) => event === 'node.sample_failed')).toHaveLength(1);
    expect(sampler.historyStats().points).toBe(6);
    state.broken = false;
    vi.advanceTimersByTime(1000);
    state.broken = true;
    vi.advanceTimersByTime(1000);
    expect(logs.events().filter((event) => event === 'node.sample_failed')).toHaveLength(2);
  });

  it('tallies what it did in a summary line', () => {
    const { sampler, logs } = rig();
    sampler.start();
    sampler.demand('hub', { summary: 1000 });
    vi.advanceTimersByTime(31_000);
    const summary = logs.records.find((record) => record.event === 'node.sample_summary');
    expect(summary?.payload).toMatchObject({ failures: 0 });
  });
});
