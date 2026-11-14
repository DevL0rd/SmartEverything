import {
  PLANNER_ALARM_ROW,
  type PlannerAlarmRow,
  type PlannerDay,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { zonedInstant } from '../../../format/time';
import {
  dayCountsOf,
  deviceIdsOf,
  dialsFit,
  halfWidthOf,
  isSplit,
  leadHeightOf,
  leadWhenOf,
  linesFit,
  ringsInOrderOf,
} from './home-fit';

const ZONE = 'Europe/Berlin';
const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const STAMP = '2026-11-01T08:00:00.000Z';
const DEVICE = 'a1b2c3d4-0000-4000-8000-0000000000d1';
const NOW = zonedInstant('2026-11-07', 14 * 60, ZONE);
const MINUTE = 60_000;

function occurrence(id: string, patch: Partial<PlannerOccurrenceView> = {}): PlannerOccurrenceView {
  return {
    item_id: `00000000-0000-4000-8000-0000000000${id}`,
    occurrence_key: 'single',
    collection_id: '00000000-0000-4000-8000-000000000020',
    kind: 'task',
    title: `Item ${id}`,
    location: null,
    priority: null,
    all_day: false,
    start: null,
    end: null,
    due_at: null,
    due_date: null,
    status: 'open',
    recurring: false,
    moved: false,
    completed_at: null,
    completed_by: null,
    evidence: null,
    attachments: [],
    google_state: null,
    ...patch,
  };
}

function day(patch: Partial<PlannerDay>): PlannerDay {
  return {
    date: '2026-11-07',
    time_zone: ZONE,
    now: new Date(NOW).toISOString(),
    missed: [],
    current: [],
    upcoming: [],
    done: [],
    happened: [],
    rings: [],
    next_alarm_at: null,
    strip: [],
    ...patch,
  };
}

function alarmOf(id: string, change: Partial<PlannerAlarmRow>): PlannerAlarmRow {
  return PLANNER_ALARM_ROW.parse({
    id: `a1b2c3d4-0000-4000-8000-0000000000${id}`,
    profile_id: PROFILE,
    label: null,
    time: '07:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: 'Morning light',
    ramp_seconds: 60,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
    created_at: STAMP,
    updated_at: STAMP,
    ...change,
  });
}

const at = (minutes: number): string => new Date(NOW + minutes * MINUTE).toISOString();

describe('Up next counts', () => {
  it('counts missed, left and done and the done share of the whole day', () => {
    const counts = dayCountsOf(
      day({
        missed: [occurrence('01'), occurrence('02')],
        current: [occurrence('03')],
        upcoming: [occurrence('04'), occurrence('05')],
        done: [occurrence('06'), occurrence('07'), occurrence('08')],
      }),
    );
    expect(counts).toEqual({ missed: 2, left: 3, done: 3, share: 3 / 8 });
  });

  it('gives an empty day a share of nothing', () => {
    expect(dayCountsOf(day({})).share).toBe(0);
  });
});

describe('Up next lead line', () => {
  it('counts down to the next start and shows its span', () => {
    const next = occurrence('01', { start: at(10), end: at(40) });
    expect(leadWhenOf(next, ZONE, NOW)).toBe('In 10 min · 14:10 to 14:40');
  });

  it('shows the time left of something running now', () => {
    const now = occurrence('01', { start: at(-20), end: at(25) });
    expect(leadWhenOf(now, ZONE, NOW)).toBe('Now · 25 min left');
  });

  it('marks a due task that is due now and keeps an untimed task as any time', () => {
    expect(leadWhenOf(occurrence('01', { due_at: at(-5) }), ZONE, NOW)).toBe('Now · 13:55');
    expect(leadWhenOf(occurrence('02'), ZONE, NOW)).toBe('Any time');
  });

  it('keeps only device attachments as live chips', () => {
    const next = occurrence('01', {
      attachments: [
        { kind: 'device', deviceId: DEVICE, face: null },
        { kind: 'link', url: 'https://example.com', title: 'Plan' },
      ],
    });
    expect(deviceIdsOf(next)).toEqual([DEVICE]);
  });
});

describe('Home widget fitting', () => {
  it('splits only the wide frame classes', () => {
    expect(isSplit('w')).toBe(true);
    expect(isSplit('xl')).toBe(true);
    expect(isSplit('m')).toBe(false);
    expect(isSplit('l')).toBe(false);
  });

  it('fits whole lines into the room and never a negative count', () => {
    expect(linesFit(76, 16, 4)).toBe(4);
    expect(linesFit(15, 16, 4)).toBe(0);
    expect(linesFit(-20, 16, 4)).toBe(0);
  });

  it('makes the lead taller when a device chip is shown', () => {
    expect(leadHeightOf('touch', true)).toBeGreaterThan(leadHeightOf('touch', false));
  });

  it('fits timer dials across the half width and down the body', () => {
    const half = halfWidthOf(800);
    expect(half).toBeCloseTo((800 - 33) / 2);
    expect(dialsFit(half, 76, 'pointer')).toBe(5);
    expect(dialsFit(half, 300, 'pointer')).toBe(15);
    expect(dialsFit(40, 76, 'pointer')).toBe(0);
  });
});

describe('Clock ring order', () => {
  it('orders the enabled alarms by their next ring and leaves out those that do not ring', () => {
    const late = alarmOf('01', { time: '22:00', label: 'Bed' });
    const morning = alarmOf('02', { time: '07:00', label: 'Wake' });
    const off = alarmOf('03', { time: '15:00', enabled: false });
    const soon = alarmOf('04', { time: '14:30', label: 'Tea' });
    const rings = ringsInOrderOf([late, morning, off, soon], NOW, ZONE);
    expect(rings.map((ring) => ring.alarm.label)).toEqual(['Tea', 'Bed', 'Wake']);
    expect(rings[0]?.at).toBe(zonedInstant('2026-11-07', 14 * 60 + 30, ZONE));
  });
});
