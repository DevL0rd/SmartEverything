import { describe, expect, it } from 'vitest';
import { EVENT_ROW, type EventRow, type JsonValue } from '@smarteverything/domain';
import { cycleViewOf, progressOf } from './cycles';

function event(
  id: number,
  kind: EventRow['kind'],
  at: string,
  details: Record<string, JsonValue>,
): EventRow {
  return EVENT_ROW.parse({
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    device_id: '00000000-0000-4000-8000-0000000000aa',
    kind,
    occurred_at: at,
    details,
    acknowledged_at: null,
    created_at: at,
  });
}

const FINISH = {
  family: 'laundry',
  program: 'Eco 40-60',
  startedAt: '2026-10-17T09:00:00.000Z',
  minutes: 213,
  outcome: 'completed',
  energy: 0.6,
  water: 48,
};

describe('laundry cycle history', () => {
  it('lists finished cycles newest first with their figures', () => {
    const view = cycleViewOf([
      event(1, 'cycle_finished', '2026-10-16T10:00:00.000Z', {
        ...FINISH,
        energy: null,
        water: null,
      }),
      event(2, 'cycle_finished', '2026-10-17T10:00:00.000Z', FINISH),
      event(3, 'cycle_finished', '2026-10-15T10:00:00.000Z', { ...FINISH, outcome: 'stopped' }),
      event(4, 'cycle_finished', '2026-10-14T10:00:00.000Z', { family: 'other' }),
    ]);
    expect(view.cycles.map((cycle) => [cycle.finishedAt.slice(0, 10), cycle.outcome])).toEqual([
      ['2026-10-17', 'completed'],
      ['2026-10-16', 'completed'],
      ['2026-10-15', 'stopped'],
    ]);
    expect(view.cycles[0]).toMatchObject({
      program: 'Eco 40-60',
      minutes: 213,
      energy: 0.6,
      water: 48,
    });
    expect(view.cycles[1]).toMatchObject({ energy: null, water: null });
  });

  it('plans the running cycle from the newest start with no finish after it', () => {
    const started = { family: 'laundry', laundry: 'started', plannedMinutes: 180 };
    expect(
      cycleViewOf([event(1, 'activity', '2026-10-17T09:00:00.000Z', started)]).plannedMinutes,
    ).toBe(180);
    expect(
      cycleViewOf([
        event(1, 'activity', '2026-10-17T09:00:00.000Z', started),
        event(2, 'cycle_finished', '2026-10-17T12:00:00.000Z', FINISH),
      ]).plannedMinutes,
    ).toBeNull();
  });

  it('turns time left into progress, and stays empty without a plan', () => {
    expect(progressOf(45, 180)).toBe(0.75);
    expect(progressOf(200, 180)).toBe(0);
    expect(progressOf(0, 180)).toBe(1);
    expect(progressOf(null, 180)).toBeNull();
    expect(progressOf(45, null)).toBeNull();
    expect(progressOf(45, 0)).toBeNull();
  });
});
