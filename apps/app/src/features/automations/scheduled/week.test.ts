import { describe, expect, it } from 'vitest';
import { SCHEDULE_ROW, type Place, type ScheduleRow } from '@smarteverything/domain';
import { lit, program, trigger } from '../model/consumers/consumer-fixtures';
import type { ScheduledV3 } from '../model/consumers/week-schedule';
import { weekOf, type TimedRule } from './week';

const PLACE: Place = { timeZone: 'UTC', location: null };
const WEDNESDAY = new Date('2026-10-14T12:00:00.000Z');
const NEXT_WEEK = new Date('2026-10-21T12:00:00.000Z');
const ID = '20000000-0000-4000-8000-000000000001';

const MORNING: ScheduledV3 = {
  program: program([trigger(1, 'trigger.time', { at: lit('07:30'), days: lit([1, 3]) })], []),
  enabled: true,
  lastRunAt: null,
};

function rule(name: string, scheduled: ScheduledV3 | null): TimedRule {
  return { id: ID, name, scheduled };
}

function oneOff(at: string, change: Partial<ScheduleRow> = {}): ScheduleRow {
  return SCHEDULE_ROW.parse({
    id: ID,
    profile_id: ID,
    client_id: null,
    via: 'app',
    label: 'Water the plants',
    timing: { kind: 'at', at },
    occurrences: [at],
    steps: [{ kind: 'wait', seconds: 1 }],
    step_lines: [null],
    device_ids: [],
    state: 'scheduled',
    next_at: at,
    occurrence: 0,
    step: 0,
    results: [],
    confirmed_at: null,
    confirmed_by: null,
    origin: null,
    created_at: '2026-10-14T08:00:00.000Z',
    updated_at: '2026-10-14T08:00:00.000Z',
    finished_at: null,
    ...change,
  });
}

function oneOffDays(rows: readonly ScheduleRow[]): readonly string[] {
  return weekOf(WEDNESDAY, [], rows, PLACE).flatMap((day) =>
    day.oneOffs.map((run) => run.at.toISOString()),
  );
}

describe('the week view', () => {
  it('lists seven days from Monday with timed runs and one-off actions on their own day', () => {
    const days = weekOf(
      WEDNESDAY,
      [rule('Morning', MORNING)],
      [oneOff('2026-10-16T09:00:00.000Z')],
      PLACE,
    );
    expect(days.map((day) => day.key)).toStrictEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(days.map((day) => day.runs.length)).toStrictEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(days.map((day) => day.oneOffs.length)).toStrictEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it('reuses the computed week while its inputs are unchanged, however they are rebuilt', () => {
    const first = weekOf(WEDNESDAY, [rule('Morning', MORNING)], [], PLACE);
    const again = weekOf(
      new Date(WEDNESDAY.getTime() + 60_000),
      [rule('Morning', { ...MORNING })],
      [],
      { ...PLACE },
    );
    expect(again).toBe(first);
  });

  it('computes again for another week or when a rule changes', () => {
    const first = weekOf(WEDNESDAY, [rule('Morning', MORNING)], [], PLACE);
    const later = weekOf(NEXT_WEEK, [rule('Morning', MORNING)], [], PLACE);
    const off = weekOf(NEXT_WEEK, [rule('Morning', { ...MORNING, enabled: false })], [], PLACE);
    expect(later).not.toBe(first);
    expect(later.map((day) => day.runs.length)).toStrictEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(off.map((day) => day.runs.length)).toStrictEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('shows only the occurrences of a one-off that are still to come', () => {
    const row = oneOff('2026-10-14T09:00:00.000Z', {
      occurrences: ['2026-10-13T09:00:00.000Z', '2026-10-15T09:00:00.000Z'],
      occurrence: 1,
    });
    expect(oneOffDays([row])).toStrictEqual(['2026-10-15T09:00:00.000Z']);
  });

  it('includes a one-off at this Monday midnight and leaves out one at the next', () => {
    const rows = [
      oneOff('2026-10-12T00:00:00.000Z'),
      oneOff('2026-10-19T00:00:00.000Z'),
      oneOff('2026-10-11T23:59:00.000Z'),
    ];
    expect(oneOffDays(rows)).toStrictEqual(['2026-10-12T00:00:00.000Z']);
  });

  it('places a waiting one-off at its next time only', () => {
    const row = oneOff('2026-10-13T09:00:00.000Z', {
      state: 'waiting',
      occurrences: ['2026-10-13T09:00:00.000Z', '2026-10-17T09:00:00.000Z'],
      next_at: '2026-10-16T09:00:00.000Z',
    });
    expect(oneOffDays([row])).toStrictEqual(['2026-10-16T09:00:00.000Z']);
  });

  it('leaves out finished one-offs', () => {
    expect(oneOffDays([oneOff('2026-10-15T09:00:00.000Z', { state: 'done' })])).toStrictEqual([]);
  });
});
