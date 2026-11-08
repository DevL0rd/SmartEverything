import {
  PLANNER_PREFERENCES,
  type PlannerAlarmRow,
  type PlannerPreferences,
  type WatchActionRequest,
  type WatchAlarm,
  type WatchCalendarEvent,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WatchOutcome } from '../../src/local/watch-actions';
import { instantsOf } from '../../src/planner/instants';
import { WatchCalendar } from '../../src/planner/watch-calendar';
import { WatchSync } from '../../src/planner/watch-sync';
import type { PlannerAlarmInput } from '../../src/store/repositories/planner-alarms';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T08:00:00.000Z');
const WEEKDAYS = [1, 2, 3, 4, 5];

type SentAction = Extract<WatchActionRequest, { type: 'save_alarm' | 'delete_alarm' }>;

let test: TestStore;
let owner: TestPerson;
let watchId: string;
let watchAlarms: WatchAlarm[];
let sent: WatchActionRequest[];
let answer: WatchOutcome;
let preferences: PlannerPreferences;
let sync: WatchSync;
let refreshed: string[];

const BASE_PREFERENCES =
  '{"general":{"week_start":1,"day_start":"06:00","day_end":"22:00","working_hours":{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"},"shown_profile_id":null},"day_planner":{"fade":"soft","show_happened":true,"show_sleep":true,"show_weather":true,"missed_scope":"today"},"tasks":{"default_collection_id":null,"smart_lists":["today"],"suggest_completion":true},"calendar":{"default_view":"week","default_reminders":[],"show_tasks":true,"show_alarms":true,"show_sleep":true,"show_free_time":true},"clock":{"sound":"sunrise","ramp_seconds":30,"snooze_minutes":9,"targets":[],"wake_scene_id":null,"world_clocks":[]},"watch":"WATCH","ai":{"briefing":"off","evening_review":false,"plan_suggestions":false}}';

function preferencesOf(watch: PlannerPreferences['watch']): PlannerPreferences {
  return PLANNER_PREFERENCES.parse(
    JSON.parse(BASE_PREFERENCES.replace('"WATCH"', JSON.stringify(watch))),
  );
}

function report(): void {
  test.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'xiaomi_watch:aa:bb',
      parentId: null,
      kind: 'other',
      name: 'Band',
      model: 'miwear.watch',
      manufacturer: 'xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {
        driver: 'xiaomi_watch',
        config: { settings: [], alarms: watchAlarms, faces: [], goals: [], sports: [] },
      },
    },
  ]);
}

function applied(action: SentAction): void {
  if (action.type === 'delete_alarm') {
    watchAlarms = watchAlarms.filter((alarm) => alarm.id !== action.id);
  } else {
    const id = action.alarm.id ?? Math.max(0, ...watchAlarms.map((alarm) => alarm.id ?? 0)) + 1;
    watchAlarms = [...watchAlarms.filter((alarm) => alarm.id !== id), { ...action.alarm, id }];
  }
  report();
}

function send(_deviceId: string, action: WatchActionRequest): Promise<WatchOutcome> {
  sent.push(action);
  if (answer.ok && (action.type === 'save_alarm' || action.type === 'delete_alarm')) {
    applied(action);
  }
  return Promise.resolve(answer);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function ports(): {
  store: TestStore['store'];
  channel: { send: typeof send };
  profileOf: () => string;
  preferences: () => PlannerPreferences;
  log: ReturnType<typeof testLogger>;
} {
  return {
    store: test.store,
    channel: { send },
    profileOf: (): string => owner.profileId,
    preferences: (): PlannerPreferences => preferences,
    log: testLogger('watch'),
  };
}

function alarmInput(change: Partial<PlannerAlarmInput> = {}): PlannerAlarmInput {
  return {
    profile_id: owner.profileId,
    label: 'Work',
    time: '07:00',
    days: WEEKDAYS,
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: 'sunrise',
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [{ kind: 'device', deviceId: watchId }],
    watch: [],
    source: 'planner',
    ...change,
  };
}

function alarms(): PlannerAlarmRow[] {
  return test.store.plannerAlarms.list(owner.profileId);
}

function saves(): WatchActionRequest[] {
  return sent.filter((action) => action.type === 'save_alarm');
}

beforeEach(async () => {
  test = await testStore(() => NOW);
  owner = addPerson(test, 'Owner', 'owner');
  watchAlarms = [];
  sent = [];
  refreshed = [];
  answer = { ok: true, detail: 'Done' };
  preferences = preferencesOf({ watch_alarm_sync: true, watch_calendar_push: true });
  report();
  const [device] = test.store.devices.list();
  if (device === undefined) throw new Error('the watch was not stored');
  watchId = device.id;
  sync = new WatchSync(ports());
  sync.start();
});

afterEach(async () => {
  sync.stop();
  await test.close();
});

describe('alarm sync', () => {
  it('saves and deletes through the bridge and keeps the watch alarm id', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await settle();
    expect(saves()).toEqual([
      {
        type: 'save_alarm',
        alarm: {
          id: null,
          time: '07:00',
          days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          enabled: true,
          smart: false,
        },
      },
    ]);
    expect(alarms()[0]?.watch).toMatchObject([{ alarmId: 1, state: 'synced', detail: null }]);
    test.store.plannerAlarms.remove(alarm.id, owner.profileId);
    await settle();
    expect(sent.at(-1)).toEqual({ type: 'delete_alarm', id: 1 });
    expect(watchAlarms).toEqual([]);
    expect(alarms()).toEqual([]);
    expect(saves()).toHaveLength(1);
  });

  it('keeps the reason of a failed save and does not retry on its own', async () => {
    answer = { ok: false, reason: 'refused', detail: 'The watch is not connected.' };
    test.store.plannerAlarms.insert(alarmInput());
    await settle();
    expect(alarms()[0]?.watch).toMatchObject([
      { state: 'failed', detail: 'The watch is not connected.', alarmId: null },
    ]);
    watchAlarms = [{ id: 7, time: '23:00', enabled: true, days: [], smart: false }];
    report();
    await settle();
    expect(saves()).toHaveLength(1);
    answer = { ok: true, detail: 'Done' };
    sync.connected(watchId);
    await settle();
    expect(saves()).toHaveLength(2);
    expect(alarms()[0]?.watch).toMatchObject([{ state: 'synced', alarmId: 8 }]);
  });

  it('puts a ring-once-on-a-date alarm off the watch with the reason in words', async () => {
    test.store.plannerAlarms.insert(alarmInput({ days: [], once_on: '2026-11-09' }));
    test.store.plannerAlarms.insert(alarmInput({ time: '08:00', skip_on: '2026-11-09' }));
    await settle();
    expect(sent).toEqual([]);
    expect(alarms().flatMap((alarm) => alarm.watch)).toMatchObject([
      {
        state: 'not_on_watch',
        detail: 'Rings once on a date, and the watch only repeats on weekdays.',
      },
      {
        state: 'not_on_watch',
        detail: 'The next ring is skipped, and the watch cannot skip a single ring.',
      },
    ]);
  });
});

describe('reconnect and watch-made alarms', () => {
  it('imports a watch-only alarm with source watch and never deletes the watch alarms', async () => {
    watchAlarms = [
      { id: 4, time: '06:15', enabled: true, days: ['sat', 'sun'], smart: false },
      { id: 9, time: '23:00', enabled: false, days: [], smart: false },
    ];
    report();
    sync.connected(watchId);
    await settle();
    const imported = alarms();
    expect(imported).toHaveLength(2);
    expect(imported.find((alarm) => alarm.time === '06:15')).toMatchObject({
      source: 'watch',
      label: null,
      days: [6, 0],
      enabled: true,
      targets: [{ kind: 'device', deviceId: watchId }],
      watch: [{ alarmId: 4, state: 'synced' }],
    });
    expect(sent).toEqual([]);
    expect(watchAlarms).toHaveLength(2);
  });

  it('sends only the diff on reconnect', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    const second = test.store.plannerAlarms.insert(alarmInput({ time: '09:30' }));
    await settle();
    answer = { ok: false, reason: 'unreachable', detail: 'No phone could be reached.' };
    test.store.plannerAlarms.update(second.id, owner.profileId, { time: '10:00' });
    await settle();
    const before = saves().length;
    answer = { ok: true, detail: 'Done' };
    sync.connected(watchId);
    await settle();
    expect(saves()).toHaveLength(before + 1);
    expect(saves().at(-1)).toMatchObject({ alarm: { time: '10:00', id: 2 } });
    expect(
      alarms()
        .flatMap((alarm) => alarm.watch)
        .every((link) => link.state === 'synced'),
    ).toBe(true);
  });

  it('takes an edit made on the watch into the planner without sending', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    await settle();
    const before = sent.length;
    watchAlarms = watchAlarms.map((alarm) => ({ ...alarm, time: '06:20', enabled: false }));
    report();
    await settle();
    expect(sent).toHaveLength(before);
    expect(alarms()[0]).toMatchObject({ time: '06:20', enabled: false, label: 'Work' });
    expect(alarms()[0]?.watch).toMatchObject([{ alarmId: 1, state: 'synced' }]);
  });
});

describe('calendar push', () => {
  let calendar: WatchCalendar;
  let collectionId: string;

  function addEvent(title: string, start: string, end: string, notes = ''): void {
    test.store.plannerItems.insert({
      ...instantsOf({
        start_local: start,
        end_local: end,
        time_zone: 'UTC',
        all_day: false,
        rrule: null,
      }),
      profile_id: owner.profileId,
      collection_id: collectionId,
      kind: 'event',
      parent_id: null,
      title,
      notes,
      location: 'Office',
      priority: null,
      tags: [],
      estimate_minutes: null,
      start_local: start,
      end_local: end,
      time_zone: 'UTC',
      all_day: false,
      due_date: null,
      due_at: null,
      rrule: null,
      exdates: [],
      series_id: null,
      original_start: null,
      status: 'open',
      position: 0,
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [{ minutes_before: 10 }],
      google: null,
      created_by: 'person',
    });
  }

  function calendars(): WatchCalendarEvent[][] {
    return sent.flatMap((action) => (action.type === 'set_calendar' ? [[...action.events]] : []));
  }

  beforeEach(() => {
    collectionId = test.store.plannerCollections.insert({
      profile_id: owner.profileId,
      kind: 'calendar',
      name: 'Work',
      colour: 'work',
      icon: 'briefcase',
      position: 0,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    }).id;
    calendar = new WatchCalendar({
      ...ports(),
      refresh: (profileId): Promise<void> => {
        refreshed.push(profileId);
        return Promise.resolve();
      },
      now: (): Date => NOW,
    });
    calendar.start();
  });

  afterEach(() => {
    calendar.stop();
  });

  it('pushes the next events after pulling Google, and again only when they change', async () => {
    addEvent('Standup', '2026-11-08T09:00', '2026-11-08T09:30', 'Daily');
    await settle();
    expect(refreshed).toEqual([owner.profileId]);
    expect(calendars()).toEqual([
      [
        {
          title: 'Standup',
          description: 'Daily',
          location: 'Office',
          start: Date.parse('2026-11-08T09:00:00Z') / 1000,
          end: Date.parse('2026-11-08T09:30:00Z') / 1000,
          allDay: false,
          remindMinutes: 10,
        },
      ],
    ]);
    calendar.connected(watchId);
    await settle();
    expect(calendars()).toHaveLength(2);
    addEvent('Review', '2026-11-09T09:00', '2026-11-09T10:00');
    await settle();
    expect(
      calendars()
        .at(-1)
        ?.map((event) => event.title),
    ).toEqual(['Standup', 'Review']);
  });

  it('keeps only the next 50 events, the watch limit', async () => {
    for (let day = 0; day < 60; day += 1) {
      const date = Temporal.PlainDate.from('2026-11-08').add({ days: day }).toString();
      addEvent(`Event ${String(day)}`, `${date}T09:00`, `${date}T10:00`);
    }
    await settle();
    const last = calendars().at(-1) ?? [];
    expect(last).toHaveLength(50);
    expect(last[0]?.title).toBe('Event 0');
    expect(last[49]?.title).toBe('Event 49');
  });

  it('pushes nothing when the setting is off', async () => {
    preferences = preferencesOf({ watch_alarm_sync: true, watch_calendar_push: false });
    addEvent('Standup', '2026-11-08T09:00', '2026-11-08T09:30');
    calendar.connected(watchId);
    await settle();
    expect(calendars()).toEqual([]);
    expect(refreshed).toEqual([]);
  });
});
