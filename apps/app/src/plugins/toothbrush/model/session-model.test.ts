import { describe, expect, it } from 'vitest';
import { oralbSessionOf, oralbViewOf, sessionOf, viewOf } from './fixtures';
import {
  dayLabel,
  dayOfSession,
  excessText,
  groupSessions,
  hasExcess,
  hardSecondsOf,
  localTime,
  partOfDay,
  placeRuns,
  pressureRuns,
  recapOf,
  resultOf,
  sessionLine,
  sessionTitle,
} from './session-model';

const PROFILE = viewOf().profile;

describe('how a session is named', () => {
  it('says morning, afternoon or evening from the local hour of the brush', () => {
    expect(partOfDay(sessionOf({ startedAt: '2026-10-18T07:00:00Z' }))).toBe('Morning');
    expect(partOfDay(sessionOf({ startedAt: '2026-10-18T14:00:00Z' }))).toBe('Afternoon');
    expect(partOfDay(sessionOf({ startedAt: '2026-10-18T21:00:00Z' }))).toBe('Evening');
    expect(partOfDay(sessionOf({ startedAt: '2026-10-18T02:00:00Z' }))).toBe('Evening');
  });

  it('uses the zone offset of the brush rather than the phone', () => {
    const session = sessionOf({ startedAt: '2026-10-18T23:30:00Z', zoneOffsetSeconds: 7200 });
    expect(localTime(session)).toBe('01:30');
    expect(dayOfSession(session)).toBe('2026-10-19');
  });

  it('combines the part of day and the mode', () => {
    expect(sessionTitle(sessionOf())).toBe('Morning · Clean');
    expect(sessionTitle(sessionOf({ mode: null }))).toBe('Morning · Brushing');
  });

  it('writes the day as today, yesterday or the date', () => {
    expect(dayLabel('2026-10-18', '2026-10-18')).toBe('Today');
    expect(dayLabel('2026-10-17', '2026-10-18')).toBe('Yesterday');
    expect(dayLabel('2026-10-12', '2026-10-18')).toBe('Mon 12 Oct');
  });
});

describe('the result of a session', () => {
  it('is full for a whole routine and says how short an early stop was', () => {
    expect(resultOf(sessionOf())).toEqual({ word: 'Full', tone: 'positive' });
    expect(resultOf(sessionOf({ durationS: 75, complete: false }))).toEqual({
      word: 'Short by 0:45',
      tone: 'warning',
    });
    expect(sessionLine(sessionOf({ durationS: 75, complete: false }))).toBe('1:15 of 2:00');
  });
});

describe('grouping by day', () => {
  it('keeps the order and starts a group when the day changes', () => {
    const groups = groupSessions(
      [
        sessionOf({ id: 'a', startedAt: '2026-10-18T21:00:00Z' }),
        sessionOf({ id: 'b', startedAt: '2026-10-18T07:00:00Z' }),
        sessionOf({ id: 'c', startedAt: '2026-10-17T21:00:00Z' }),
      ],
      '2026-10-18',
    );
    expect(groups.map((group) => [group.label, group.sessions.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ]);
  });
});

describe('the pressure strip', () => {
  it('merges neighbouring seconds of the same pressure into runs', () => {
    expect(pressureRuns([0, 0, 1, 1, 1, 2, 1])).toEqual([
      { pressure: 'no_contact', seconds: 2 },
      { pressure: 'optimal', seconds: 3 },
      { pressure: 'too_high', seconds: 1 },
      { pressure: 'optimal', seconds: 1 },
    ]);
  });

  it('places the runs across the width with a visible minimum', () => {
    const placed = placeRuns(pressureRuns([1, 1, 1, 2]), 4, 100);
    expect(placed.map((run) => [run.x, run.width])).toEqual([
      [0, 75],
      [75, 25],
    ]);
    expect(placeRuns(pressureRuns([1, 2]), 1000, 100)[1]?.width).toBe(1.5);
  });

  it('adds up the seconds pressing too hard', () => {
    expect(hardSecondsOf(pressureRuns([1, 2, 2, 1, 2]))).toBe(3);
  });

  it('tells a gentle session from one with pressure', () => {
    const gentle = sessionOf({ pressure: { excessS: 0, optimalS: 3, strip: [1, 1, 1] } });
    const hard = sessionOf({ pressure: { excessS: 1, optimalS: 2, strip: [1, 2, 1] } });
    expect(hasExcess(gentle)).toBe(false);
    expect(hasExcess(hard)).toBe(true);
    expect(hasExcess(sessionOf())).toBe(false);
    expect(excessText(0)).toBe('No time pressing too hard');
    expect(excessText(12)).toBe('12 s pressing too hard');
  });
});

describe('the recap of a session', () => {
  it('lists reached zones, the ones missed and how short a session was', () => {
    const recap = recapOf(sessionOf({ durationS: 50, complete: false }), PROFILE);
    expect(recap.reached).toEqual(['Upper left', 'Upper front', 'Upper right']);
    expect(recap.missed).toEqual(['Lower right', 'Lower front', 'Lower left']);
    expect(recap.short).toBe('1:10');
    expect(recap.estimated).toBe(true);
  });

  it('claims no zones for a mode without them', () => {
    const recap = recapOf(sessionOf({ mode: 'tongue_care' }), PROFILE);
    expect(recap.estimated).toBe(false);
    expect(recap.reached).toEqual([]);
  });

  it('carries the pressure runs and the time pressing too hard', () => {
    const recap = recapOf(
      sessionOf({ pressure: { excessS: 2, optimalS: 1, strip: [1, 2, 2] } }),
      PROFILE,
    );
    expect(recap.excess).toBe('2 s pressing too hard');
    expect(recap.runs).toHaveLength(2);
  });
});

describe('the recap of an Oral-B session', () => {
  const profile = oralbViewOf().profile;

  it('takes the quarters from the pacer and says so', () => {
    const recap = recapOf(oralbSessionOf(), profile);
    expect(recap.source).toBe('pacer');
    expect(recap.estimated).toBe(false);
    expect(recap.zonesShown).toBe(true);
    expect(recap.reached).toEqual(['Upper left', 'Upper right']);
    expect(recap.missed).toEqual(['Lower right', 'Lower left']);
  });

  it('shows no quarters for a session the handle sent no seconds for', () => {
    expect(recapOf(oralbSessionOf({ zones: [] }), profile).zonesShown).toBe(false);
  });

  it('keeps Sonicare sessions estimated', () => {
    expect(recapOf(sessionOf(), PROFILE).source).toBe('estimated');
  });
});
