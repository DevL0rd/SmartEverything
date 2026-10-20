import { BOTTLE_SESSION, type BottleSession } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NOW } from './fixtures';
import { curveOf, sessionCardOf } from './session-model';

const session = (overrides: Record<string, unknown> = {}): BottleSession =>
  BOTTLE_SESSION.parse({
    startedAt: '2026-10-18T07:41:00+02:00',
    endedAt: '2026-10-18T11:30:00+02:00',
    open: false,
    startMl: 680,
    endMl: 160,
    drunkMl: 520,
    drinks: 3,
    readings: 4,
    curve: [
      { at: '2026-10-18T07:41:00+02:00', ml: 680 },
      { at: '2026-10-18T11:30:00+02:00', ml: 160 },
    ],
    ...overrides,
  });

describe('session cards', () => {
  it('names a finished fill by its times and what was drunk', () => {
    const card = sessionCardOf(session(), NOW);
    expect(card.title).toMatch(/ to /);
    expect(card.drinks).toBe('3 drinks');
    expect(card.span).toBe('3 h 49 min');
    expect(card.open).toBe(false);
    expect(card.summary.replaceAll(' ', ' ')).toContain('520 ml in 3 drinks');
  });

  it('calls the open fill the current one and says the singular drink', () => {
    const card = sessionCardOf(session({ open: true, drinks: 1 }), NOW);
    expect(card.title).toBe('Current fill');
    expect(card.drinks).toBe('1 drink');
    expect(card.span).toBe('Still filled');
  });

  it('turns the level curve into chart points in time order', () => {
    const points = curveOf(session());
    expect(points).toHaveLength(2);
    expect(points[0]?.v).toBe(680);
    expect((points[1]?.t ?? 0) > (points[0]?.t ?? 0)).toBe(true);
  });
});
