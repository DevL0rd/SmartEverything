import type { TreadmillSession } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  groupSessions,
  sessionLine,
  sessionTitle,
  sourceBadge,
  whenText,
} from './session-model';

function session(over: Partial<TreadmillSession> = {}): TreadmillSession {
  return {
    id: 's1',
    deviceId: 'd',
    walkerProfileId: null,
    startedAt: '2026-10-18T16:05:00.000Z',
    endedAt: '2026-10-18T16:37:00.000Z',
    zoneOffsetSeconds: 7200,
    activeSeconds: 1930,
    pausedSeconds: 0,
    distanceM: 2400,
    steps: 3300,
    kcal: 140,
    kcalNet: 90,
    avgKmh: 4.5,
    maxKmh: 5.2,
    mode: 'manual',
    kind: 'walk',
    zones: { walk: 1930, jog: 0, run: 0 },
    splits: [],
    source: 'live',
    climbM: 12,
    inclineAvg: 1.5,
    inclineMax: 3,
    inclineSeconds: { '0': 1000, '2': 930 },
    kcalSource: 'estimate',
    kcalEstimate: 140,
    heartRateSource: null,
    ...over,
  };
}

describe('how a session is named and told', () => {
  it('names a session by the local part of the day and its kind', () => {
    expect(sessionTitle(session())).toBe('Evening walk');
    expect(sessionTitle(session({ startedAt: '2026-10-18T06:00:00.000Z' }))).toBe('Morning walk');
    expect(sessionTitle(session({ startedAt: '2026-10-18T10:00:00.000Z', kind: 'run' }))).toBe(
      'Afternoon run',
    );
    expect(
      sessionTitle(session({ startedAt: '2026-10-18T21:30:00.000Z', kind: 'intervals' })),
    ).toBe('Night intervals');
  });

  it('says when it happened in the local day', () => {
    expect(whenText(session(), '2026-10-18')).toBe('Today, 18:05');
    expect(whenText(session(), '2026-10-19')).toBe('Yesterday, 18:05');
    expect(whenText(session(), '2026-10-25')).toBe('Sun 18 Oct, 18:05');
    expect(dayLabel('2026-10-12', '2026-10-18')).toBe('Mon 12 Oct');
  });

  it('puts distance, time and average speed in one line', () => {
    expect(sessionLine(session())).toBe('2.40 km · 32:10 · 4.5 km/h');
  });

  it('badges what did not come from the live link', () => {
    expect(sourceBadge(session())).toBeNull();
    expect(sourceBadge(session({ source: 'pad_summary' }))).toBe('Summary from the belt');
    expect(sourceBadge(session({ source: 'pad_record' }))).toBe('Stored on the belt');
  });

  it('groups sessions by local day in the order given', () => {
    const groups = groupSessions(
      [
        session({ id: 'a' }),
        session({ id: 'b', startedAt: '2026-10-18T07:00:00.000Z' }),
        session({ id: 'c', startedAt: '2026-10-17T07:00:00.000Z' }),
      ],
      '2026-10-18',
    );
    expect(groups.map((group) => [group.label, group.sessions.map((entry) => entry.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
    ]);
  });
});
