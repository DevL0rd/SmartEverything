import { HEALTH_RECORD, type HealthRecord } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lastNightOf, NIGHT_WINDOW_MS } from './watch-sleep';

const WAKE = Date.parse('2026-10-16T06:20:00Z');

function night(
  endTime: string,
  stages: readonly { startTime: string; endTime: string; stage: number }[],
): HealthRecord {
  return HEALTH_RECORD.parse({
    recordId: `night-${endTime}`,
    type: 'SleepSession',
    startTime: `${endTime.slice(0, 8)}01T00:00:00Z`,
    endTime,
    zoneOffsetSeconds: 0,
    sourceApp: 'watch',
    lastModified: endTime,
    data: { title: null, notes: null, stages },
  });
}

const STAGES = [
  { startTime: '2026-10-15T23:10:00Z', endTime: '2026-10-16T01:00:00Z', stage: 4 },
  { startTime: '2026-10-16T01:00:00Z', endTime: '2026-10-16T02:00:00Z', stage: 5 },
  { startTime: '2026-10-16T02:00:00Z', endTime: '2026-10-16T02:10:00Z', stage: 1 },
  { startTime: '2026-10-16T02:10:00Z', endTime: '2026-10-16T03:00:00Z', stage: 6 },
  { startTime: '2026-10-16T03:00:00Z', endTime: '2026-10-16T03:10:00Z', stage: 0 },
];

describe('last night on the watch page', () => {
  it('maps each stage to a sleep lane and drops unknown spans', () => {
    const found = lastNightOf([night('2026-10-16T06:20:00Z', STAGES)], WAKE + 3_600_000);
    expect(found?.segments.map((segment) => segment.stage)).toEqual([
      'core',
      'deep',
      'awake',
      'rem',
    ]);
  });

  it('counts the minutes asleep without awake time', () => {
    const found = lastNightOf([night('2026-10-16T06:20:00Z', STAGES)], WAKE);
    expect(found?.asleepMinutes).toBe(110 + 60 + 50);
  });

  it('draws one light span when the session has no stages', () => {
    const found = lastNightOf([night('2026-10-16T06:20:00Z', [])], WAKE);
    expect(found?.segments).toEqual([
      { start: Date.parse('2026-10-01T00:00:00Z'), end: WAKE, stage: 'core' },
    ]);
  });

  it('is hidden once the night is older than 36 hours', () => {
    const records = [night('2026-10-16T06:20:00Z', STAGES)];
    expect(lastNightOf(records, WAKE + NIGHT_WINDOW_MS)).not.toBeNull();
    expect(lastNightOf(records, WAKE + NIGHT_WINDOW_MS + 1)).toBeNull();
  });

  it('takes the most recent night', () => {
    const older = night('2026-10-15T06:00:00Z', STAGES);
    const found = lastNightOf([older, night('2026-10-16T06:20:00Z', STAGES)], WAKE);
    expect(found?.wake).toBe(WAKE);
  });

  it('is hidden when there is no session', () => {
    expect(lastNightOf([], WAKE)).toBeNull();
  });
});
