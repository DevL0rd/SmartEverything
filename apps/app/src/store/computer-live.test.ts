import type {
  ComputerLiveNotice,
  ComputerParts,
  ComputerSummary,
  CpuPart,
  ProcessRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputerLiveStore, mergeParts } from './computer-live';
import { ComputerRings } from './computer-rings';
import { LiveWatchRegistry } from './live-watch';

const PC = '11111111-1111-4111-8111-111111111111';

const SUMMARY: ComputerSummary = {
  cpuLoad: 10,
  cpuTemperature: 50,
  memoryPercent: 40,
  swapPercent: null,
  gpuLoad: null,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: null,
  gpuWatts: null,
  downloadRate: 0,
  uploadRate: 0,
  fullestDisk: { mount: '/', percent: 70 },
  batteryLevel: null,
  charging: null,
  totalWatts: null,
  processCount: 300,
  uptimeSeconds: 100,
};

const CPU: CpuPart = {
  load: 10,
  cores: [10, 20],
  frequenciesGhz: [3, 3],
  performanceLoad: null,
  efficiencyLoad: null,
  frequencyGhz: 3,
  maxFrequencyGhz: 5,
  temperature: 50,
  powerWatts: null,
  powerLimitWatts: null,
  loadAverage: [1, 1, 1],
  throttled: null,
};

function row(pid: number, cpu: number): ProcessRow {
  return {
    pid,
    start: 1,
    ppid: 0,
    name: `p${String(pid)}`,
    command: '',
    user: 'me',
    state: 'running',
    cpu,
    memoryBytes: 1,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
  };
}

function notice(second: number, parts: ComputerParts): ComputerLiveNotice {
  return {
    type: 'computer_live',
    deviceId: PC,
    at: new Date(Date.UTC(2026, 9, 17, 12, 0, second)).toISOString(),
    parts,
  };
}

describe('merging live parts', () => {
  it('keeps the identity of a part whose values did not change', () => {
    const first = mergeParts({}, { summary: SUMMARY, cpu: CPU });
    const next = mergeParts(first, { summary: { ...SUMMARY, cpuLoad: 11 }, cpu: { ...CPU } });
    expect(next.cpu).toBe(first.cpu);
    expect(next.summary).not.toBe(first.summary);
    expect(mergeParts(next, { cpu: { ...CPU } })).toBe(next);
  });

  it('applies changed process rows to the ordered list and keeps unchanged rows', () => {
    const keyframe = mergeParts(
      {},
      {
        processes: {
          total: 3,
          offset: 0,
          order: ['1:1', '2:1', '3:1'],
          rows: [row(1, 5), row(2, 4), row(3, 3)],
        },
      },
    );
    const next = mergeParts(keyframe, {
      processes: { total: 3, offset: 0, order: ['2:1', '1:1', '3:1'], rows: [row(2, 9)] },
    });
    expect(next.processes?.rows.map((item) => item.pid)).toStrictEqual([2, 1, 3]);
    expect(next.processes?.rows[1]).toBe(keyframe.processes?.rows[0]);
    expect(next.processes?.rows[0]?.cpu).toBe(9);
  });

  it('fills the fixed fields a changed row left out from the row it already has', () => {
    const keyframe = mergeParts(
      {},
      { processes: { total: 2, offset: 0, order: ['1:1', '2:1'], rows: [row(1, 1), row(2, 2)] } },
    );
    const { pid, start, cpu } = row(2, 8);
    const next = mergeParts(keyframe, {
      processes: {
        total: 2,
        offset: 0,
        order: ['1:1', '2:1'],
        rows: [
          {
            pid,
            start,
            cpu,
            state: 'running',
            memoryBytes: 1,
            gpu: null,
            diskRate: 0,
            threads: 1,
            descendants: 0,
            own: true,
          },
        ],
      },
    });
    expect(next.processes?.rows[0]).toBe(keyframe.processes?.rows[0]);
    expect(next.processes?.rows[1]).toStrictEqual(row(2, 8));
  });

  it('skips a changed row it has never seen the fixed fields of', () => {
    const { pid, start, cpu } = row(5, 1);
    const next = mergeParts(
      {},
      {
        processes: {
          total: 1,
          offset: 0,
          order: ['5:1'],
          rows: [
            {
              pid,
              start,
              cpu,
              state: 'running',
              memoryBytes: 1,
              gpu: null,
              diskRate: 0,
              threads: 1,
              descendants: 0,
              own: true,
            },
          ],
        },
      },
    );
    expect(next.processes?.rows).toStrictEqual([]);
  });

  it('leaves out rows that fell out of the window', () => {
    const keyframe = mergeParts(
      {},
      { processes: { total: 2, offset: 0, order: ['1:1', '2:1'], rows: [row(1, 1), row(2, 2)] } },
    );
    const next = mergeParts(keyframe, {
      processes: { total: 2, offset: 0, order: ['2:1'], rows: [] },
    });
    expect(next.processes?.rows.map((item) => item.pid)).toStrictEqual([2]);
  });
});

describe('the live store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function build(): { watch: LiveWatchRegistry; rings: ComputerRings; live: ComputerLiveStore } {
    const watch = new LiveWatchRegistry();
    const rings = new ComputerRings();
    return { watch, rings, live: new ComputerLiveStore(watch, rings, 60_000) };
  }

  it('commits once per changing notice and not at all when nothing changed', () => {
    const { live } = build();
    const store = live.store(PC);
    const listener = vi.fn();
    store.subscribe(listener);
    live.receive(notice(0, { summary: SUMMARY }));
    live.receive(notice(1, { summary: { ...SUMMARY } }));
    live.receive(notice(2, { summary: { ...SUMMARY, cpuLoad: 12 } }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get().parts.summary?.cpuLoad).toBe(12);
  });

  it('holds the last value of a demanded part in its ring when only another part changed', () => {
    const { live, rings, watch } = build();
    watch.hold(PC, ['summary', 'cpu']);
    live.receive(notice(0, { summary: SUMMARY, cpu: CPU }));
    live.receive(notice(1, { summary: { ...SUMMARY, uptimeSeconds: 101 } }));
    live.receive(notice(2, { summary: { ...SUMMARY, uptimeSeconds: 102 } }));
    expect(
      rings
        .ring(PC, 'cpu/load')
        .points()
        .map((point) => point.t),
    ).toStrictEqual([0, 1000, 2000].map((ms) => Date.UTC(2026, 9, 17, 12, 0, 0) + ms));
  });

  it('does not extend the ring of a part that is no longer demanded', () => {
    const { live, rings, watch } = build();
    const release = watch.hold(PC, ['summary', 'cpu']);
    live.receive(notice(0, { summary: SUMMARY, cpu: CPU }));
    release();
    watch.hold(PC, ['summary']);
    live.receive(notice(1, { summary: { ...SUMMARY, uptimeSeconds: 101 } }));
    expect(rings.ring(PC, 'cpu/load').points()).toHaveLength(1);
    expect(rings.ring(PC, 'summary/cpuLoad').points()).toHaveLength(2);
  });

  it('forgets a device a minute after its last demand ended unless it is watched again', () => {
    const { live, rings, watch } = build();
    const release = watch.hold(PC, ['summary']);
    live.receive(notice(0, { summary: SUMMARY }));
    release();
    vi.advanceTimersByTime(59_000);
    expect(live.store(PC).get().parts.summary).toBeDefined();
    watch.hold(PC, ['summary']);
    vi.advanceTimersByTime(120_000);
    expect(live.store(PC).get().parts.summary).toBeDefined();
    expect(rings.ring(PC, 'summary/cpuLoad').points()).toHaveLength(1);
  });

  it('clears the store and rings when the minute passes', () => {
    const { live, rings, watch } = build();
    watch.hold(PC, ['summary'])();
    live.receive(notice(0, { summary: SUMMARY }));
    vi.advanceTimersByTime(60_000);
    expect(live.store(PC).get().parts).toStrictEqual({});
    expect(rings.ring(PC, 'summary/cpuLoad').points()).toStrictEqual([]);
  });
});
