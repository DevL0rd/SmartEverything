import type { HistoryBackfillResponse } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { ComputerRings, RING_SPAN_MS, SeriesRing } from './computer-rings';

const DEVICE = '11111111-1111-4111-8111-111111111111';

describe('a series ring', () => {
  it('keeps only the last window and ignores samples that are not newer', () => {
    const ring = new SeriesRing();
    for (let second = 0; second <= 400; second += 1) ring.push(second * 1000, second);
    expect(ring.push(400_000, 1)).toBe(false);
    expect(ring.push(399_000, 1)).toBe(false);
    const points = ring.points();
    expect(points[0]).toStrictEqual({ t: 100_000, v: 100 });
    expect(points.at(-1)).toStrictEqual({ t: 400_000, v: 400 });
    expect(points).toHaveLength(RING_SPAN_MS / 1000 + 1);
  });

  it('returns the same array until a sample arrives and notifies listeners once per sample', () => {
    const ring = new SeriesRing();
    const listener = vi.fn();
    ring.subscribe(listener);
    ring.push(1000, 1);
    const first = ring.points();
    expect(ring.points()).toBe(first);
    ring.push(2000, 2);
    expect(ring.points()).not.toBe(first);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('prepends older history without touching newer live points', () => {
    const ring = new SeriesRing();
    ring.push(10_000, 10);
    ring.push(11_000, 11);
    ring.seed([
      { t: 8000, v: 8 },
      { t: 9000, v: 9 },
      { t: 10_000, v: 99 },
      { t: 11_000, v: 99 },
    ]);
    expect(ring.points().map((point) => point.v)).toStrictEqual([8, 9, 10, 11]);
  });

  it('drops history older than the window', () => {
    const ring = new SeriesRing();
    ring.push(1_000_000, 1);
    ring.seed([
      { t: 500_000, v: 5 },
      { t: 900_000, v: 9 },
    ]);
    expect(ring.points().map((point) => point.v)).toStrictEqual([9, 1]);
  });
});

describe('the computer rings', () => {
  const rings = new ComputerRings();

  it('turns a response from the hub into points and skips gaps', () => {
    const response: HistoryBackfillResponse = {
      device: DEVICE,
      source: 'computers',
      intervalMs: 1000,
      windowMs: 300_000,
      oldestMs: 1000,
      newestMs: 3000,
      timestamps: [1000, 2000, 3000],
      series: [{ topic: 'summary', key: 'cpuLoad', unit: '%', values: [10, null, 30] }],
      downsample: { method: 'none', sourcePoints: 3, stepMs: 1000 },
    };
    rings.seed(DEVICE, response);
    expect(rings.ring(DEVICE, 'summary/cpuLoad').points()).toStrictEqual([
      { t: 1000, v: 10 },
      { t: 3000, v: 30 },
    ]);
  });

  it('clears a device and lets it backfill again', () => {
    expect(rings.claimBackfill(DEVICE, ['summary'])).toStrictEqual(['summary']);
    expect(rings.claimBackfill(DEVICE, ['summary'])).toStrictEqual([]);
    rings.drop(DEVICE);
    expect(rings.ring(DEVICE, 'summary/cpuLoad').points()).toStrictEqual([]);
    expect(rings.claimBackfill(DEVICE, ['summary'])).toStrictEqual(['summary']);
  });

  it('backfills only the topics nobody asked for yet and lets a failed one retry', () => {
    const fresh = new ComputerRings();
    expect(fresh.claimBackfill(DEVICE, ['summary'])).toStrictEqual(['summary']);
    expect(fresh.claimBackfill(DEVICE, ['summary', 'cpu'])).toStrictEqual(['cpu']);
    fresh.releaseBackfill(DEVICE, ['cpu']);
    expect(fresh.claimBackfill(DEVICE, ['summary', 'cpu'])).toStrictEqual(['cpu']);
  });
});
