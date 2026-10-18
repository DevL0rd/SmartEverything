import { describe, expect, it } from 'vitest';
import type { SeriesPoint } from '../../src/node/collectors/history-series';
import { HistoryStore } from '../../src/node/collectors/history-store';

const POLICY = { interval_ms: 1000, window_ms: 60_000 };

function point(key: string, value: number | null, topic = 'summary'): SeriesPoint {
  return { topic, key, unit: '%', value };
}

function filled(store: HistoryStore, count: number, start = 1_000_000): void {
  for (let index = 0; index < count; index += 1) {
    store.record(start + index * 1000, [point('cpuLoad', index), point('gpuLoad', null)]);
  }
}

const ALL = { topics: ['summary', 'cpu'], maxPoints: 5000 };

describe('HistoryStore', () => {
  it('serves what was recorded since a moment, oldest first', () => {
    const store = new HistoryStore(POLICY);
    filled(store, 10);
    const columns = store.backfill({ ...ALL, sinceMs: 1_005_000 }, 1_010_000);
    expect(columns.timestamps).toEqual([1_005_000, 1_006_000, 1_007_000, 1_008_000, 1_009_000]);
    expect(columns.series.find((item) => item.key === 'cpuLoad')?.values).toEqual([5, 6, 7, 8, 9]);
    expect(columns.series.find((item) => item.key === 'gpuLoad')?.values).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(columns).toMatchObject({
      intervalMs: 1000,
      windowMs: 60_000,
      oldestMs: 1_005_000,
      newestMs: 1_009_000,
      downsample: { method: 'none', sourcePoints: 5, stepMs: 1000 },
    });
  });

  it('answers a window relative to now', () => {
    const store = new HistoryStore(POLICY);
    filled(store, 10);
    const columns = store.backfill({ ...ALL, windowMs: 60_000 }, 1_010_000);
    expect(columns.timestamps).toHaveLength(10);
  });

  it('rolls the oldest samples off when the window is full', () => {
    const store = new HistoryStore(POLICY);
    filled(store, 75);
    const columns = store.backfill({ ...ALL, sinceMs: 0 }, 2_000_000);
    expect(columns.timestamps).toHaveLength(60);
    expect(columns.oldestMs).toBe(1_015_000);
    expect(columns.series[0]?.values.at(-1)).toBe(74);
    expect(store.points).toBe(60);
  });

  it('averages buckets when more points are held than were asked for', () => {
    const store = new HistoryStore(POLICY);
    filled(store, 10);
    const columns = store.backfill({ topics: ['summary'], maxPoints: 5, sinceMs: 0 }, 2_000_000);
    expect(columns.downsample).toEqual({ method: 'mean', sourcePoints: 10, stepMs: 2000 });
    expect(columns.series.find((item) => item.key === 'cpuLoad')?.values).toEqual([
      0.5, 2.5, 4.5, 6.5, 8.5,
    ]);
    expect(columns.timestamps).toEqual([1_001_000, 1_003_000, 1_005_000, 1_007_000, 1_009_000]);
  });

  it('returns only the asked topics and nothing for an unknown one', () => {
    const store = new HistoryStore(POLICY);
    store.record(1000, [point('cpuLoad', 1), point('load', 2, 'cpu')]);
    expect(
      store
        .backfill({ topics: ['cpu'], maxPoints: 10, sinceMs: 0 }, 5000)
        .series.map((s) => s.topic),
    ).toEqual(['cpu']);
    expect(store.backfill({ topics: ['audio'], maxPoints: 10, sinceMs: 0 }, 5000).series).toEqual(
      [],
    );
  });

  it('shows a series that appears late as empty before it began', () => {
    const store = new HistoryStore(POLICY);
    store.record(1000, [point('a', 1)]);
    store.record(2000, [point('a', 2), point('b', 20)]);
    const columns = store.backfill({ ...ALL, sinceMs: 0 }, 5000);
    expect(columns.series.find((item) => item.key === 'b')?.values).toEqual([null, 20]);
  });

  it('keeps the newest samples when the window shrinks and grows', () => {
    const store = new HistoryStore(POLICY);
    filled(store, 30);
    store.setPolicy({ interval_ms: 1000, window_ms: 60_000 });
    expect(store.points).toBe(30);
    store.setPolicy({ interval_ms: 5000, window_ms: 60_000 });
    expect(store.points).toBe(12);
    expect(store.backfill({ ...ALL, sinceMs: 0 }, 9_999_999).series[0]?.values.at(-1)).toBe(29);
    store.setPolicy({ interval_ms: 1000, window_ms: 120_000 });
    expect(store.points).toBe(12);
    filled(store, 1, 2_000_000);
    expect(store.points).toBe(13);
  });

  it('drops series that stopped reporting for a whole window', () => {
    const store = new HistoryStore({ interval_ms: 1000, window_ms: 60_000 });
    store.record(0, [point('gone', 1)]);
    for (let index = 1; index <= 120; index += 1) {
      store.record(index * 1000, [point('kept', index)]);
    }
    expect(store.seriesCount).toBe(1);
  });

  it('reports the memory it holds', () => {
    const store = new HistoryStore(POLICY);
    store.record(1000, [point('a', 1), point('b', 2)]);
    expect(store.bytes).toBe(60 * 8 + 2 * 60 * 4);
  });

  it('forgets everything on clear', () => {
    const store = new HistoryStore(POLICY);
    filled(store, 5);
    store.clear();
    expect(store.backfill({ ...ALL, sinceMs: 0 }, 5000)).toMatchObject({
      timestamps: [],
      series: [],
      oldestMs: null,
    });
  });
});
