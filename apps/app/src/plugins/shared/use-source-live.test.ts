import { describe, expect, it } from 'vitest';
import { ComputerRings } from '../../store/computer-rings';
import { feedReadings, liveSeriesId } from './use-source-live';

describe('feedReadings', () => {
  it('adds each reading to its own ring and skips missing values', () => {
    const rings = new ComputerRings();
    const rate = liveSeriesId('download_rate');
    const latency = liveSeriesId('latency');
    feedReadings(rings, 'router', 1_000, [
      [rate, 5],
      [latency, null],
    ]);
    feedReadings(rings, 'router', 2_000, [[rate, 7]]);
    expect(rings.ring('router', rate).points()).toEqual([
      { t: 1_000, v: 5 },
      { t: 2_000, v: 7 },
    ]);
    expect(rings.ring('router', latency).points()).toEqual([]);
  });

  it('ignores a reading that is not newer than the last one', () => {
    const rings = new ComputerRings();
    const rate = liveSeriesId('download_rate');
    feedReadings(rings, 'router', 2_000, [[rate, 7]]);
    feedReadings(rings, 'router', 2_000, [[rate, 9]]);
    feedReadings(rings, 'router', 1_000, [[rate, 1]]);
    expect(rings.ring('router', rate).points()).toEqual([{ t: 2_000, v: 7 }]);
  });
});
