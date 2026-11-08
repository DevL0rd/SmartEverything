import type { VacuumValues } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { jobSummaryOf, type JobRooms, type JobSummary } from '../model/job-summary';
import { vacuumChipOf } from '../model/phase-chip';
import { lastSeenMsOf, primaryRowOf, stripOf } from './overview-model';

const ROOMS: JobRooms = [
  { id: 3, name: 'Kitchen', areaM2: 12, hidden: false },
  { id: 4, name: 'Hall', areaM2: 8, hidden: false },
];

function rowOf(values: VacuumValues, online = true, rooms = 0): readonly string[] {
  return primaryRowOf(vacuumChipOf(values, online), rooms).map(
    (action) => `${action.key}:${action.look}`,
  );
}

function jobOf(values: VacuumValues): JobSummary | null {
  const reading = jobSummaryOf(values, ROOMS);
  return reading.ok ? reading.value : null;
}

describe('primary row', () => {
  it('offers one primary Start while docked, whatever the dock is doing', () => {
    for (const status of [1, 2, 9]) {
      expect(rowOf({ vacuum_status: status })).toStrictEqual(['start:primary']);
    }
    expect(rowOf({ vacuum_status: 9, vacuum_asleep: true })).toStrictEqual(['start:primary']);
  });

  it('names the rooms picked on the Start button', () => {
    const [start] = primaryRowOf(vacuumChipOf({ vacuum_status: 9 }, true), 2);
    expect(start?.label).toBe('Clean 2 rooms');
    expect(primaryRowOf(vacuumChipOf({ vacuum_status: 9 }, true), 0)[0]?.label).toBe('Start');
  });

  it('offers Pause as the one primary while cleaning, mopping and mapping', () => {
    for (const status of [4, 16, 17, 10]) {
      expect(rowOf({ vacuum_status: status })).toStrictEqual(['pause:primary', 'dock:secondary']);
    }
  });

  it('offers Resume as the one primary when paused, with Dock and Stop', () => {
    for (const status of [5, 18]) {
      expect(rowOf({ vacuum_status: status })).toStrictEqual([
        'resume:primary',
        'dock:secondary',
        'stop:danger',
      ]);
    }
  });

  it('has no primary while the robot is on its way back', () => {
    for (const status of [6, 7, 13]) {
      expect(rowOf({ vacuum_status: status })).toStrictEqual(['pause:secondary', 'stop:danger']);
    }
  });

  it('offers nothing offline, updating or at the station', () => {
    expect(rowOf({ vacuum_status: 4 }, false)).toStrictEqual([]);
    for (const status of [11, 25, 12, 14, 8]) {
      expect(rowOf({ vacuum_status: status })).toStrictEqual([]);
    }
    expect(rowOf({})).toStrictEqual([]);
  });

  it('never offers more than one primary', () => {
    for (const status of [1, 2, 4, 5, 6, 7, 9, 10, 16, 17, 18]) {
      const primaries = primaryRowOf(vacuumChipOf({ vacuum_status: status }, true), 0).filter(
        (action) => action.look === 'primary',
      );
      expect(primaries.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('status strip', () => {
  const working: VacuumValues = {
    vacuum_status: 4,
    battery: 71,
    vacuum_job: JSON.stringify({ rooms: [3] }),
    vacuum_progress: 50,
    vacuum_seconds: 1080,
  };

  it('shows battery, phase line with room and area, job detail and progress while cleaning', () => {
    const strip = stripOf({
      values: working,
      online: true,
      stationProgress: null,
      lastSeenMs: null,
      roomName: 'Kitchen',
      job: jobOf(working),
    });
    expect(strip).toStrictEqual({
      battery: 71,
      title: 'Cleaning · Kitchen · 6 of 12 m²',
      detail: 'Kitchen · 18 min',
      progress: 0.5,
    });
  });

  it('keeps the detail and progress for a clean that is paused', () => {
    const values: VacuumValues = { ...working, vacuum_status: 5 };
    const strip = stripOf({
      values,
      online: true,
      stationProgress: null,
      lastSeenMs: null,
      roomName: 'Kitchen',
      job: jobOf(values),
    });
    expect(strip.title).toBe('Paused · Kitchen');
    expect(strip.progress).toBe(0.5);
  });

  it('shows no detail or progress when the robot is not on a job', () => {
    const values: VacuumValues = { vacuum_status: 9, battery: 100 };
    const strip = stripOf({
      values,
      online: true,
      stationProgress: null,
      lastSeenMs: null,
      roomName: null,
      job: null,
    });
    expect(strip).toStrictEqual({
      battery: 100,
      title: 'Docked · charged',
      detail: null,
      progress: null,
    });
  });

  it('keeps the progress inside the bar', () => {
    const values: VacuumValues = { ...working, vacuum_progress: 140 };
    expect(
      stripOf({
        values,
        online: true,
        stationProgress: null,
        lastSeenMs: null,
        roomName: null,
        job: jobOf(values),
      }).progress,
    ).toBe(1);
  });

  it('says the robot is not reachable offline and has no battery without a reading', () => {
    const strip = stripOf({
      values: { vacuum_status: 4 },
      online: false,
      stationProgress: null,
      lastSeenMs: null,
      roomName: null,
      job: null,
    });
    expect(strip.title).toBe('Not reachable.');
    expect(strip.battery).toBeNull();
  });
});

describe('strip state', () => {
  it('shows no stale job detail while docked and awake', () => {
    const values: VacuumValues = {
      vacuum_status: 9,
      vacuum_asleep: false,
      battery: 100,
      vacuum_job: JSON.stringify({ rooms: [3] }),
      vacuum_seconds: 81,
    };
    const strip = stripOf({
      values,
      online: true,
      stationProgress: null,
      lastSeenMs: null,
      roomName: null,
      job: jobOf(values),
    });
    expect(strip.detail).toBeNull();
    expect(strip.progress).toBeNull();
  });

  it('shows the last clean under the docked line', () => {
    const input = {
      values: { vacuum_status: 9, battery: 100 },
      online: true,
      stationProgress: null,
      lastSeenMs: null,
      roomName: null,
      job: null,
    };
    expect(stripOf(input, 'Last clean today 09:14 · 42 m² · 38 min').detail).toBe(
      'Last clean today 09:14 · 42 m² · 38 min',
    );
    expect(stripOf({ ...input, stationProgress: 0.4 }, 'Today 09:14').detail).toBeNull();
    expect(stripOf({ ...input, values: { vacuum_status: 15 } }, 'Today 09:14').detail).toBeNull();
  });

  it('drives the bar from the station while it washes the mop', () => {
    const strip = stripOf({
      values: { vacuum_status: 9, battery: 80 },
      online: true,
      stationProgress: 0.4,
      lastSeenMs: null,
      roomName: null,
      job: null,
    });
    expect(strip.progress).toBe(0.4);
  });

  it('shows the last known battery offline instead of a live ring', () => {
    const strip = stripOf({
      values: { vacuum_status: 9, battery: 100 },
      online: false,
      stationProgress: null,
      lastSeenMs: null,
      roomName: null,
      job: null,
    });
    expect(strip).toStrictEqual({
      battery: null,
      title: 'Last known 100%',
      detail: null,
      progress: null,
    });
  });

  it('keeps Dock in error', () => {
    expect(rowOf({ vacuum_status: 15 })).toStrictEqual(['dock:secondary']);
  });
});

describe('last seen', () => {
  it('reads a moment and ignores a broken one', () => {
    expect(lastSeenMsOf('2026-10-24T10:00:00.000Z')).toBe(Date.parse('2026-10-24T10:00:00.000Z'));
    expect(lastSeenMsOf('not a moment')).toBeNull();
    expect(lastSeenMsOf(undefined)).toBeNull();
  });
});
