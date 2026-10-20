import type { SessionDetail } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  inclineAreaPath,
  inclineRows,
  inclineTop,
  MAX_PROFILE_POINTS,
  profileMax,
  profilePath,
  splitRows,
  stripParts,
  thinned,
} from './profile-model';

describe('drawing the speed profile of a session', () => {
  it('keeps every point of a short profile and spreads a long one evenly', () => {
    const short = [1, 2, 3];
    expect(thinned(short, MAX_PROFILE_POINTS)).toBe(short);
    const long = Array.from({ length: 1000 }, (_, index) => index);
    const reduced = thinned(long, 100);
    expect(reduced).toHaveLength(100);
    expect(reduced[0]).toBe(0);
    expect(reduced[99]).toBe(990);
  });

  it('puts the top of the axis one unit above the fastest point, never below the floor', () => {
    expect(profileMax([{ t: 0, kmh: 3, incline: null }], 10)).toBe(10);
    expect(profileMax([{ t: 0, kmh: 11.2, incline: null }], 10)).toBe(13);
  });

  it('draws a path across the width with the fastest point at the top', () => {
    const path = profilePath(
      [
        { t: 0, kmh: 0, incline: null },
        { t: 10, kmh: 10, incline: null },
      ],
      { width: 100, height: 50, yMax: 10 },
    );
    expect(path).toBe('M0.0 50.0 L100.0 0.0');
    expect(profilePath([], { width: 100, height: 50, yMax: 10 })).toBe('');
  });
});

describe('splits and the strip of active and paused time', () => {
  it('shows the fastest kilometre longest and floors the slowest bar', () => {
    const rows = splitRows([600, 660, 3000]);
    expect(rows.map((row) => row.pace)).toEqual(['10:00 /km', '11:00 /km', '50:00 /km']);
    expect(rows[0]).toMatchObject({ km: 1, share: 1, fast: true });
    expect(rows[1]?.share).toBeCloseTo(600 / 660, 5);
    expect(rows[2]?.share).toBe(0.2);
    expect(splitRows([])).toEqual([]);
  });

  it('colours running parts by zone and leaves paused parts without one', () => {
    const segments: SessionDetail['segments'] = [
      { fromS: 0, toS: 60, avgKmh: 4, state: 'running' },
      { fromS: 60, toS: 90, avgKmh: 0, state: 'paused' },
      { fromS: 90, toS: 120, avgKmh: 9, state: 'running' },
    ];
    expect(stripParts(segments).map((part) => [part.grow, part.zone])).toEqual([
      [60, 'walk'],
      [30, null],
      [30, 'run'],
    ]);
  });
});

describe('the incline of a session', () => {
  const points = [
    { t: 0, kmh: 3, incline: 0 },
    { t: 10, kmh: 4, incline: 5 },
    { t: 20, kmh: 4, incline: null },
    { t: 30, kmh: 4, incline: 10 },
  ];

  it('finds the highest incline and none when the belt sent none', () => {
    expect(inclineTop(points)).toBe(10);
    expect(inclineTop([{ t: 0, kmh: 3, incline: null }])).toBeNull();
  });

  it('draws a filled band on its own axis that closes at the bottom', () => {
    expect(inclineAreaPath(points, { width: 30, height: 20, top: 10 })).toBe(
      'M0.0 20L0.0 20.0L10.0 10.0L30.0 0.0L30.0 20Z',
    );
    expect(inclineAreaPath([], { width: 30, height: 20, top: 10 })).toBe('');
    expect(inclineAreaPath(points, { width: 30, height: 20, top: 0 })).toBe('');
  });

  it('lists the time at each incline from low to high, labelled by the scale', () => {
    const rows = inclineRows({ '5': 120, '0': 240, '10': 30 }, 'percent');
    expect(rows.map((row) => row.label)).toEqual(['0 %', '5 %', '10 %']);
    expect(rows.map((row) => row.minutes)).toEqual(['4 min', '2 min', '30 s']);
    expect(rows[0]?.share).toBe(1);
    expect(rows[1]?.share).toBe(0.5);
    expect(inclineRows({ '3': 60 }, 'unconfirmed')[0]?.label).toBe('3');
    expect(inclineRows({}, 'levels')).toEqual([]);
  });
});
