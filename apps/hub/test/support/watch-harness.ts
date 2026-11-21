import {
  PLANNER_PREFERENCES,
  type PlannerAlarmRow,
  type PlannerPreferences,
  type WatchActionRequest,
  type WatchAlarm,
} from '@smarteverything/domain';
import type { WatchOutcome } from '../../src/local/watch-actions';
import { WatchSync } from '../../src/planner/watch-sync';
import type { PlannerAlarmInput } from '../../src/store/repositories/planner-alarms';
import { testLogger } from './logs';
import { addPerson, type TestPerson } from './phone-fixtures';
import { testStore, type TestStore } from './store';

class WatchState {
  test!: TestStore;
  owner!: TestPerson;
  watchId!: string;
  watchAlarms!: WatchAlarm[];
  sent!: WatchActionRequest[];
  answer!: WatchOutcome;
  preferences!: PlannerPreferences;
  settlers: (() => Promise<void>)[] = [];
  sync!: WatchSync;
  refreshed!: string[];
}

export const w = new WatchState();

export const NOW = new Date('2026-11-07T08:00:00.000Z');
export const WEEKDAYS = [1, 2, 3, 4, 5];

type SentAction = Extract<WatchActionRequest, { type: 'save_alarm' | 'delete_alarm' }>;

const BASE_PREFERENCES =
  '{"general":{"week_start":1,"day_start":"06:00","day_end":"22:00","working_hours":{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"},"shown_profile_id":null},"day_planner":{"fade":"soft","show_happened":true,"show_sleep":true,"show_weather":true,"missed_scope":"today"},"tasks":{"default_collection_id":null,"smart_lists":["today"],"suggest_completion":true},"calendar":{"default_view":"week","default_reminders":[],"show_tasks":true,"show_alarms":true,"show_sleep":true,"show_free_time":true},"clock":{"sound":{"kind":"tone","id":"sunrise"},"ramp_seconds":30,"snooze_minutes":9,"snooze_limit":null,"targets":[],"wake_automation_id":null,"world_clocks":[]},"bedtime":{"enabled":false,"schedule":[],"reminder_minutes":30,"wind_down_minutes":30,"wind_down_automation_id":null,"do_not_disturb":true,"sleep_sound":null},"sleep_sounds":{"sound":null,"timer_minutes":60,"fade_seconds":30},"watch":"WATCH","ai":{"briefing":"off","evening_review":false,"plan_suggestions":false}}';

export function preferencesOf(watch: PlannerPreferences['watch']): PlannerPreferences {
  return PLANNER_PREFERENCES.parse(
    JSON.parse(BASE_PREFERENCES.replace('"WATCH"', JSON.stringify(watch))),
  );
}

export function report(): void {
  w.test.store.devices.upsert([
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
        config: { settings: [], alarms: w.watchAlarms, faces: [], goals: [], sports: [] },
      },
    },
  ]);
}

function applied(action: SentAction): void {
  if (action.type === 'delete_alarm') {
    w.watchAlarms = w.watchAlarms.filter((alarm) => alarm.id !== action.id);
  } else {
    const id = action.alarm.id ?? Math.max(0, ...w.watchAlarms.map((alarm) => alarm.id ?? 0)) + 1;
    w.watchAlarms = [...w.watchAlarms.filter((alarm) => alarm.id !== id), { ...action.alarm, id }];
  }
  report();
}

function send(_deviceId: string, action: WatchActionRequest): Promise<WatchOutcome> {
  w.sent.push(action);
  if (w.answer.ok && (action.type === 'save_alarm' || action.type === 'delete_alarm')) {
    applied(action);
  }
  return Promise.resolve(w.answer);
}

export async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await w.sync.settled();
    for (const settled of w.settlers) await settled();
  }
}

export function ports(): {
  store: TestStore['store'];
  channel: { send: typeof send };
  profileOf: () => Promise<string>;
  preferences: () => Promise<PlannerPreferences>;
  log: ReturnType<typeof testLogger>;
} {
  return {
    store: w.test.store,
    channel: { send },
    profileOf: (): Promise<string> => Promise.resolve(w.owner.profileId),
    preferences: (): Promise<PlannerPreferences> => Promise.resolve(w.preferences),
    log: testLogger('watch'),
  };
}

export function alarmInput(change: Partial<PlannerAlarmInput> = {}): PlannerAlarmInput {
  return {
    profile_id: w.owner.profileId,
    label: 'Work',
    time: '07:00',
    days: WEEKDAYS,
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: { kind: 'tone', id: 'sunrise' },
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    snooze_limit: null,
    challenge: { kind: 'none' },
    sunrise: null,
    smart_minutes: null,
    wake_automation_id: null,
    wake_lead_minutes: null,
    targets: [{ kind: 'device', deviceId: w.watchId }],
    watch: [],
    source: 'planner',
    ...change,
  };
}

export function alarms(): PlannerAlarmRow[] {
  return w.test.store.plannerAlarms.list(w.owner.profileId);
}

export function saves(): WatchActionRequest[] {
  return w.sent.filter((action) => action.type === 'save_alarm');
}

export async function startWatchHarness(): Promise<void> {
  w.test = await testStore(() => NOW);
  w.owner = addPerson(w.test, 'Owner', 'owner');
  w.watchAlarms = [];
  w.sent = [];
  w.refreshed = [];
  w.settlers = [];
  w.answer = { ok: true, detail: 'Done' };
  w.preferences = preferencesOf({ watch_alarm_sync: true, watch_calendar_push: true });
  report();
  const [device] = w.test.store.devices.list();
  if (device === undefined) throw new Error('the watch was not stored');
  w.watchId = device.id;
  w.sync = new WatchSync(ports());
  w.sync.start();
}

export async function stopWatchHarness(): Promise<void> {
  await settle();
  w.sync.stop();
  await w.test.close();
}
