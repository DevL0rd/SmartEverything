import { describe, expect, it, vi } from 'vitest';
import {
  API_ENDPOINTS,
  SCHEDULE_LIMITS,
  SCHEDULE_ROW,
  type ScheduleRow,
  type ScheduleSaved,
} from '@smarteverything/domain';
import type { ScheduleInput } from '../../../api/schedules';
import { moment } from '../../../format/time';

const sent = vi.hoisted((): ScheduleInput[] => []);

const ID = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const DAY = 86_400;

function rowOf(overrides: Partial<Record<string, unknown>> = {}): ScheduleRow {
  return SCHEDULE_ROW.parse({
    id: ID,
    profile_id: ID,
    client_id: null,
    via: 'app',
    label: 'Check Drive files for damage',
    timing: { kind: 'series', everySeconds: 30 * DAY, count: 12, startAt: null },
    occurrences: ['2026-12-07T12:00:00.000Z'],
    steps: [{ kind: 'tool', tool: 'drive_edit', args: { action: 'scrub_start' } }],
    step_lines: [null],
    device_ids: [],
    state: 'scheduled',
    next_at: '2026-12-07T12:00:00.000Z',
    occurrence: 0,
    step: 0,
    results: [],
    confirmed_at: null,
    confirmed_by: null,
    origin: null,
    created_at: '2026-11-07T12:00:00.000Z',
    updated_at: '2026-11-07T12:00:00.000Z',
    finished_at: null,
    ...overrides,
  });
}

vi.mock('../../../api/schedules', () => ({
  createSchedule: (body: ScheduleInput): Promise<ScheduleSaved> => {
    sent.push(body);
    return Promise.resolve({ outcome: 'scheduled', schedule: rowOf() });
  },
}));

const {
  MOST_DAYS,
  everyText,
  scheduleLineOf,
  scheduleValueOf,
  saveScrubSchedule,
  scrubScheduleBody,
  scrubScheduleOf,
  scrubTimingOf,
} = await import('./page-storage-schedule');

describe('scrub schedule', () => {
  it('finds the active schedule whose step starts a scrub', () => {
    const scrub = rowOf();
    const lamp = rowOf({
      id: OTHER,
      steps: [{ kind: 'tool', tool: 'device_control', args: { action: 'scrub_start' } }],
    });
    const cancelled = rowOf({ id: OTHER, state: 'cancelled' });
    expect(scrubScheduleOf([lamp, scrub])).toBe(scrub);
    expect(scrubScheduleOf([lamp, cancelled])).toBeNull();
    expect(scrubScheduleOf([])).toBeNull();
  });

  it('repeats every chosen number of days within what the schedule system books ahead', () => {
    for (const days of [1, 7, 30, MOST_DAYS]) {
      const timing = scrubTimingOf(days);
      if (timing.kind !== 'series') throw new Error('expected a series');
      expect(timing.everySeconds).toBe(days * DAY);
      expect(timing.count).toBeGreaterThanOrEqual(1);
      expect(timing.count).toBeLessThanOrEqual(SCHEDULE_LIMITS.occurrences);
      expect(timing.count * timing.everySeconds).toBeLessThanOrEqual(
        SCHEDULE_LIMITS.horizonSeconds,
      );
    }
    expect(scrubTimingOf(1)).toMatchObject({ count: SCHEDULE_LIMITS.occurrences });
    expect(scrubTimingOf(30)).toMatchObject({ count: 12 });
  });

  it('saves an ordinary schedule with the drive_edit scrub_start tool step', async () => {
    const body = scrubScheduleBody(30);
    expect(API_ENDPOINTS.createSchedule.body.parse(body)).toEqual({
      label: 'Check Drive files for damage',
      timing: { kind: 'series', everySeconds: 30 * DAY, count: 12, startAt: null },
      steps: [
        {
          kind: 'tool',
          tool: 'drive_edit',
          args: { action: 'scrub_start' },
          stopOnFailure: false,
        },
      ],
    });
    await expect(saveScrubSchedule(30)).resolves.toEqual(rowOf());
    expect(sent).toEqual([body]);
  });

  it('names how often it runs', () => {
    expect(everyText(1)).toBe('Every day');
    expect(everyText(30)).toBe('Every 30 days');
    expect(scheduleValueOf(rowOf())).toBe('Every 30 days');
    expect(scheduleValueOf(rowOf({ timing: { kind: 'in', seconds: 60 } }))).toBe('Scheduled');
    const now = Date.parse('2026-11-07T12:00:00.000Z');
    expect(scheduleLineOf(rowOf(), now, 'UTC')).toBe(
      `Every 30 days · next ${moment('2026-12-07T12:00:00.000Z', now, 'UTC')}`,
    );
    expect(scheduleLineOf(rowOf({ state: 'running' }), now, 'UTC')).toBe(
      'Every 30 days · checking now',
    );
  });
});
