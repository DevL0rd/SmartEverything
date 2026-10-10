import { describe, expect, it } from 'vitest';
import {
  dayBounds,
  dayFraction,
  dayOf,
  marksOf,
  sameDay,
  shiftDay,
  timelineItems,
  NO_FILTER,
  type TimelineEvent,
  type TimelineRecording,
} from './timeline';

const ZONE = 'Europe/Berlin';

function event(
  id: string,
  kind: TimelineEvent['kind'],
  at: string,
  deviceId: string | null = 'door',
): TimelineEvent {
  return { id, device_id: deviceId, kind, occurred_at: at };
}

function recording(
  id: string,
  kind: 'snapshot' | 'clip',
  eventId: string | null,
  deviceId = 'door',
): TimelineRecording {
  return { id, device_id: deviceId, event_id: eventId, kind, started_at: '2026-10-08T10:00:00Z' };
}

describe('days in the home time zone', () => {
  it('finds the local day of an instant', () => {
    expect(dayOf('2026-10-08T22:30:00Z', ZONE)).toStrictEqual({ year: 2026, month: 10, day: 9 });
    expect(dayOf('2026-10-08T21:59:00Z', ZONE)).toStrictEqual({ year: 2026, month: 10, day: 8 });
  });

  it('moves across month and year ends', () => {
    expect(shiftDay({ year: 2026, month: 12, day: 31 }, 1)).toStrictEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(shiftDay({ year: 2026, month: 3, day: 1 }, -1)).toStrictEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('compares days field by field', () => {
    const day = { year: 2026, month: 10, day: 8 };
    expect(sameDay(day, { ...day })).toBe(true);
    expect(sameDay(day, { ...day, day: 9 })).toBe(false);
    expect(sameDay(day, { ...day, month: 11 })).toBe(false);
    expect(sameDay(day, { ...day, year: 2025 })).toBe(false);
  });

  it('bounds a day by local midnights, including the day clocks go back', () => {
    expect(dayBounds({ year: 2026, month: 10, day: 8 }, ZONE)).toStrictEqual({
      start: '2026-10-07T22:00:00.000Z',
      end: '2026-10-08T22:00:00.000Z',
    });
    expect(dayBounds({ year: 2026, month: 10, day: 25 }, ZONE)).toStrictEqual({
      start: '2026-10-24T22:00:00.000Z',
      end: '2026-10-25T23:00:00.000Z',
    });
  });

  it('places an instant along its local day', () => {
    expect(dayFraction('2026-10-08T10:00:00Z', ZONE)).toBe(0.5);
    expect(dayFraction('2026-10-07T22:00:30Z', ZONE)).toBeCloseTo(0.5 / 1440, 10);
    expect(marksOf([{ id: 'a', at: '2026-10-08T04:00:00Z', kind: 'motion' }], ZONE)).toStrictEqual([
      { id: 'a', start: 0.25, kind: 'motion' },
    ]);
  });
});

describe('the camera timeline', () => {
  const events = [
    event('ring', 'doorbell', '2026-10-08T16:12:00Z'),
    event('move', 'motion', '2026-10-08T07:31:00Z', 'garden'),
    event('lamp', 'motion', '2026-10-08T08:00:00Z', 'lamp'),
    event('home', 'alarm', '2026-10-08T09:00:00Z', null),
  ];
  const recordings = [
    recording('snap', 'snapshot', 'ring'),
    recording('clip', 'clip', 'ring'),
    recording('loose', 'clip', null, 'garden'),
    recording('gone', 'snapshot', 'deleted-event'),
    recording('lamp-shot', 'snapshot', null, 'lamp'),
  ];
  const cameras = ['door', 'garden'];

  it('joins each camera event with its snapshot and clip, newest first, then loose recordings', () => {
    const items = timelineItems(events, recordings, cameras, NO_FILTER);
    expect(
      items.map((item) => [item.id, item.kind, item.snapshot?.id, item.clip?.id]),
    ).toStrictEqual([
      ['ring', 'doorbell', 'snap', 'clip'],
      ['loose', 'recording', undefined, 'loose'],
      ['gone', 'recording', 'gone', undefined],
      ['move', 'motion', undefined, undefined],
    ]);
    expect(items[0]?.event?.id).toBe('ring');
    expect(items[1]?.event).toBeNull();
    expect(items[1]?.deviceId).toBe('garden');
  });

  it('filters by camera and by kind', () => {
    expect(
      timelineItems(events, recordings, cameras, { deviceIds: ['garden'], kinds: null }).map(
        (item) => item.id,
      ),
    ).toStrictEqual(['loose', 'move']);
    expect(
      timelineItems(events, recordings, cameras, { deviceIds: null, kinds: ['motion'] }).map(
        (item) => item.id,
      ),
    ).toStrictEqual(['move']);
    expect(
      timelineItems(events, recordings, cameras, { deviceIds: null, kinds: ['recording'] }).map(
        (item) => item.id,
      ),
    ).toStrictEqual(['loose', 'gone']);
  });
});
