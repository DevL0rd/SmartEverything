import {
  PLANNER_ALARM_CHANGES,
  PLANNER_ALARM_CREATE,
  PLANNER_ALARM_ROW,
  type PlannerAlarmRow,
  type PlannerPreferences,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { zonedInstant } from '../../../format/time';
import {
  DEFAULT_WAKE_LEAD_MINUTES,
  changeOf,
  createBodyOf,
  daysEdit,
  draftOf,
  firstOnceDateOf,
  hasTarget,
  labelEdit,
  newAlarmTimeOf,
  newDraftOf,
  onceOnEdit,
  repeatEdit,
  repeatModeOf,
  toggledDayEdit,
  toggledTargetsEdit,
  wakeEdit,
} from './alarm-draft';
import { leadOptions, smartMinutesOf, smartOptions } from './alarm-options';

const ZONE = 'Europe/Berlin';
const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const PHONE = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const WATCH = 'a1b2c3d4-0000-4000-8000-0000000000d1';
const SCENE = 'a1b2c3d4-0000-4000-8000-0000000000e1';
const STAMP = '2026-11-01T08:00:00.000Z';

function alarmOf(change: Partial<PlannerAlarmRow>): PlannerAlarmRow {
  return PLANNER_ALARM_ROW.parse({
    id: 'a1b2c3d4-0000-4000-8000-0000000000a1',
    profile_id: PROFILE,
    label: 'Wake up',
    time: '07:00',
    days: [1, 2, 3, 4, 5],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: 'default',
    ramp_seconds: 60,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [{ kind: 'client', clientId: PHONE }],
    watch: [],
    source: 'planner',
    created_at: STAMP,
    updated_at: STAMP,
    ...change,
  });
}

const CLOCK: PlannerPreferences['clock'] = {
  sound: 'default',
  ramp_seconds: 30,
  snooze_minutes: 10,
  targets: [{ kind: 'client', clientId: PHONE }],
  wake_scene_id: null,
  world_clocks: [],
};

describe('a new alarm draft', () => {
  it('takes the sound, volume ramp, snooze and ring places from the clock preferences', () => {
    const draft = newDraftOf(CLOCK, '06:30');
    expect(draft).toMatchObject({
      time: '06:30',
      sound: 'default',
      ramp_seconds: 30,
      snooze_minutes: 10,
      targets: [{ kind: 'client', clientId: PHONE }],
      enabled: true,
      vibrate: true,
      wake_scene_id: null,
      wake_lead_minutes: null,
    });
  });

  it('starts the preferred wake scene with the default lead so both are set together', () => {
    const draft = newDraftOf({ ...CLOCK, wake_scene_id: SCENE }, '06:30');
    expect(draft.wake_scene_id).toBe(SCENE);
    expect(draft.wake_lead_minutes).toBe(DEFAULT_WAKE_LEAD_MINUTES);
  });

  it('becomes a create body the hub contract accepts', () => {
    const body = createBodyOf(newDraftOf({ ...CLOCK, wake_scene_id: SCENE }, '06:30'));
    expect(PLANNER_ALARM_CREATE.safeParse(body).success).toBe(true);
  });

  it('starts at the next whole hour in the home time zone', () => {
    const now = zonedInstant('2026-11-07', 14 * 60 + 20, ZONE);
    expect(newAlarmTimeOf(now, ZONE)).toBe('15:00');
    expect(newAlarmTimeOf(zonedInstant('2026-11-07', 23 * 60 + 5, ZONE), ZONE)).toBe('00:00');
  });
});

describe('changes to a saved alarm', () => {
  it('is nothing when the edit keeps every value', () => {
    const alarm = alarmOf({});
    expect(changeOf(alarm, { time: '07:00', days: [1, 2, 3, 4, 5] })).toBeNull();
  });

  it('sends the edited fields as a change body the hub contract accepts', () => {
    const alarm = alarmOf({});
    const change = changeOf(alarm, { time: '06:45', snooze_minutes: 5 });
    expect(change).toEqual({ time: '06:45', snooze_minutes: 5 });
    expect(PLANNER_ALARM_CHANGES.safeParse(change).success).toBe(true);
  });

  it('keeps the saved draft equal to the row fields', () => {
    const alarm = alarmOf({ label: null, smart_minutes: 20 });
    expect(draftOf(alarm)).toMatchObject({ label: null, smart_minutes: 20, time: '07:00' });
  });
});

describe('repeat and ring once', () => {
  it('names the repeat mode from the days', () => {
    expect(repeatModeOf({ days: [] })).toBe('once');
    expect(repeatModeOf({ days: [0, 1, 2, 3, 4, 5, 6] })).toBe('every_day');
    expect(repeatModeOf({ days: [5, 4, 3, 2, 1] })).toBe('weekdays');
    expect(repeatModeOf({ days: [6, 0] })).toBe('weekends');
    expect(repeatModeOf({ days: [1, 3] })).toBe('custom');
  });

  it('sets the days for a mode and clears a ring once date', () => {
    expect(repeatEdit('weekends', [1])).toEqual({ days: [0, 6], once_on: null });
    expect(repeatEdit('once', [1])).toEqual({ days: [], once_on: null });
    expect(repeatEdit('custom', [3, 1])).toEqual({ days: [1, 3], once_on: null });
    expect(repeatEdit('custom', [])).toEqual({ days: [1, 2, 3, 4, 5], once_on: null });
  });

  it('toggles one day dot and keeps the days in order', () => {
    expect(toggledDayEdit([1, 5], 3)).toEqual({ days: [1, 3, 5], once_on: null });
    expect(toggledDayEdit([1, 3, 5], 3)).toEqual({ days: [1, 5], once_on: null });
    expect(daysEdit([6, 0])).toEqual({ days: [0, 6], once_on: null });
  });

  it('replaces the repeat days with a date, which the hub contract accepts', () => {
    const edit = onceOnEdit('2026-11-09');
    expect(edit).toEqual({ once_on: '2026-11-09', days: [] });
    expect(PLANNER_ALARM_CHANGES.safeParse(edit).success).toBe(true);
    expect(onceOnEdit(null)).toEqual({ once_on: null });
  });

  it('picks today for a first date while the time is still ahead, else tomorrow', () => {
    const now = zonedInstant('2026-11-07', 14 * 60, ZONE);
    expect(firstOnceDateOf('15:00', now, ZONE)).toBe('2026-11-07');
    expect(firstOnceDateOf('14:00', now, ZONE)).toBe('2026-11-08');
  });
});

describe('wake routine, ring places and label', () => {
  it('sets the wake scene and its lead together and clears both together', () => {
    expect(wakeEdit(SCENE, 15)).toEqual({ wake_scene_id: SCENE, wake_lead_minutes: 15 });
    expect(wakeEdit(null, 15)).toEqual({ wake_scene_id: null, wake_lead_minutes: null });
  });

  it('adds and removes a ring place', () => {
    const phone = { kind: 'client', clientId: PHONE } as const;
    const watch = { kind: 'device', deviceId: WATCH } as const;
    expect(toggledTargetsEdit([phone], watch)).toEqual({ targets: [phone, watch] });
    expect(toggledTargetsEdit([phone, watch], phone)).toEqual({ targets: [watch] });
    expect(hasTarget([phone], { kind: 'client', clientId: PHONE })).toBe(true);
    expect(hasTarget([phone], { kind: 'device', deviceId: PHONE })).toBe(false);
  });

  it('trims the label and stores an empty one as no label', () => {
    expect(labelEdit('  Gym  ')).toEqual({ label: 'Gym' });
    expect(labelEdit('   ')).toEqual({ label: null });
  });
});

describe('minute choices', () => {
  it('keeps a smart wake or lead value that is not a preset, in order', () => {
    expect(smartOptions(25).map((option) => option.value)).toEqual([
      'off',
      '10',
      '15',
      '20',
      '25',
      '30',
      '45',
    ]);
    expect(leadOptions(90).at(-1)).toEqual({ value: '90', label: '90 min before' });
    expect(leadOptions(0)[0]).toEqual({ value: '0', label: 'At the alarm' });
  });

  it('reads off as no smart wake', () => {
    expect(smartMinutesOf('off')).toBeNull();
    expect(smartMinutesOf('20')).toBe(20);
  });
});
