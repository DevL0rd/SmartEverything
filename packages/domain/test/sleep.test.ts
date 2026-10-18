import { describe, expect, it } from 'vitest';
import { HEALTH_RECORD, asleepMinutes, type HealthRecord } from '../src';

type SleepSession = Extract<HealthRecord, { readonly type: 'SleepSession' }>;

function stage(from: string, to: string, code: number): object {
  return { startTime: `2026-10-08T${from}:00Z`, endTime: `2026-10-08T${to}:00Z`, stage: code };
}

function session(stages: readonly object[]): SleepSession {
  const record = HEALTH_RECORD.parse({
    recordId: 'night',
    type: 'SleepSession',
    startTime: '2026-10-08T00:00:00Z',
    endTime: '2026-10-08T08:00:00Z',
    zoneOffsetSeconds: 0,
    sourceApp: 'com.mi.health',
    lastModified: '2026-10-08T08:00:00Z',
    data: { title: null, notes: null, stages },
  });
  if (record.type !== 'SleepSession') {
    throw new Error('expected a sleep session');
  }
  return record;
}

describe('asleepMinutes', () => {
  it('counts the whole session when it has no stages', () => {
    expect(asleepMinutes(session([]))).toBe(480);
  });

  it('leaves out every awake code and unknown stages, and stays at or below time in bed', () => {
    const night = session([
      stage('00:00', '01:00', 4),
      stage('01:00', '01:30', 1),
      stage('01:30', '03:00', 5),
      stage('03:00', '03:20', 3),
      stage('03:20', '04:00', 6),
      stage('04:00', '04:10', 7),
      stage('04:10', '04:20', 0),
      stage('04:20', '04:30', 99),
      stage('04:30', '07:00', 2),
    ]);
    expect(asleepMinutes(night)).toBe(60 + 90 + 40 + 150);
    expect(asleepMinutes(night)).toBeLessThanOrEqual(480);
  });

  it('is zero when every stage is awake', () => {
    expect(asleepMinutes(session([stage('00:00', '08:00', 1)]))).toBe(0);
  });

  it('falls back to time in bed when no stage has a positive length', () => {
    expect(asleepMinutes(session([stage('02:00', '02:00', 4), stage('03:00', '02:00', 5)]))).toBe(
      480,
    );
  });
});
