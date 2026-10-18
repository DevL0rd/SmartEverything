import { describe, expect, it } from 'vitest';
import { SCHEDULE_ROW, type ScheduleRow } from '@smarteverything/domain';
import { SLEEP_LABEL, SLEEP_MINUTES, sleepSave, sleepTimerOf } from './sleep-save';

const TV = '6f0e2f6e-2a43-4d61-9a0a-6f6c3a1f0b11';
const LAMP = '6f0e2f6e-2a43-4d61-9a0a-6f6c3a1f0b12';
const ID = '20000000-0000-4000-8000-000000000001';

function power(deviceId: string, value: boolean): Record<string, unknown> {
  return {
    kind: 'tool',
    tool: 'control_devices',
    args: { changes: [{ target: { deviceIds: [deviceId] }, capability: 'power', value }] },
  };
}

function row(overrides: Partial<Record<string, unknown>>): ScheduleRow {
  return SCHEDULE_ROW.parse({
    id: ID,
    profile_id: ID,
    client_id: null,
    via: 'app',
    label: SLEEP_LABEL,
    timing: { kind: 'in', seconds: 300 },
    occurrences: ['2026-10-16T12:05:00.000Z'],
    steps: [power(TV, false)],
    step_lines: [null],
    device_ids: [TV],
    state: 'scheduled',
    next_at: '2026-10-16T12:05:00.000Z',
    occurrence: 0,
    step: 0,
    results: [],
    confirmed_at: null,
    confirmed_by: null,
    origin: null,
    created_at: '2026-10-16T11:00:00.000Z',
    updated_at: '2026-10-16T11:00:00.000Z',
    finished_at: null,
    ...overrides,
  });
}

describe('television sleep timer', () => {
  it('offers the minute choices in order up to two hours', () => {
    expect(SLEEP_MINUTES).toEqual([15, 30, 60, 90, 120]);
  });

  it('creates one schedule that turns the TV off after the chosen minutes', () => {
    const save = sleepSave(TV, { kind: 'in', minutes: 30 }, null);
    expect(save).toEqual({
      kind: 'create',
      body: {
        label: SLEEP_LABEL,
        timing: { kind: 'in', seconds: 1800 },
        steps: [
          {
            kind: 'tool',
            tool: 'control_devices',
            args: {
              changes: [{ target: { deviceIds: [TV] }, capability: 'power', value: false }],
            },
          },
        ],
      },
    });
  });

  it('turns the TV off at a clock time', () => {
    const save = sleepSave(TV, { kind: 'at', time: { hour: 23, minute: 5 } }, null);
    expect(save.kind === 'create' && save.body.timing).toEqual({ kind: 'at', at: '23:05' });
  });

  it('moves the running timer instead of adding a second one', () => {
    const save = sleepSave(TV, { kind: 'in', minutes: 60 }, 'schedule-1');
    expect(save).toEqual({
      kind: 'update',
      id: 'schedule-1',
      body: { timing: { kind: 'in', seconds: 3600 } },
    });
  });

  it('finds its own sleep timer among the schedules', () => {
    const own = row({ id: '20000000-0000-4000-8000-000000000009' });
    expect(sleepTimerOf([row({ label: 'Movie night' }), own], TV)).toBe(own);
  });

  it('never takes a schedule the user made for the same TV', () => {
    const morning = row({ label: 'TV on at 07:00', steps: [power(TV, true)] });
    const movie = row({
      label: 'Movie night',
      steps: [power(TV, true), power(LAMP, false)],
      device_ids: [TV, LAMP],
    });
    const renamed = row({ label: SLEEP_LABEL, steps: [power(TV, true)] });
    const shared = row({ steps: [power(TV, false), power(LAMP, false)], device_ids: [TV, LAMP] });
    expect(sleepTimerOf([morning, movie, renamed, shared], TV)).toBeNull();
  });

  it('ignores a sleep timer that already ran and another TV’s timer', () => {
    const done = row({ state: 'done', next_at: null, finished_at: '2026-10-16T12:05:00.000Z' });
    const other = row({ steps: [power(LAMP, false)], device_ids: [LAMP] });
    expect(sleepTimerOf([done, other], TV)).toBeNull();
  });
});
