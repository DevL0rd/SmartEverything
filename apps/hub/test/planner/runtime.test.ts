import {
  PLANNER_SUMMARY_NOTICE,
  type PlannerItemRow,
  type PlannerSummaryNotice,
  type SignalInput,
  type WatchActionRequest,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import type { WatchOutcome } from '../../src/local/watch-actions';
import { instantsOf } from '../../src/planner/instants';
import { PlannerRuntime, type PlannerChannels } from '../../src/planner/runtime';
import type { SignalListener } from '../../src/signals/bus';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const START = '2026-11-07T08:00:00.000Z';
const ZONE = 'UTC';

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let collectionId: string;
let order: string[];
let summaries: PlannerSummaryNotice[];
let watchSends: WatchActionRequest[];
let listeners: Set<SignalListener>;
let runtime: PlannerRuntime;

const reminderPull = vi.fn((item: PlannerItemRow): Promise<void> => {
  order.push(`pull:${item.id}`);
  return Promise.resolve();
});

const sync = vi.fn((profileId: string): Promise<'synced'> => {
  order.push(`sync:${profileId}`);
  return Promise.resolve('synced');
});

function channels(watchProfile: string | null): PlannerChannels {
  return {
    phone: { send: (): Promise<boolean> => Promise.resolve(true) },
    watch: {
      send: (_deviceId, action): Promise<WatchOutcome> => {
        order.push(`watch:${action.type}`);
        watchSends.push(action);
        return Promise.resolve({ ok: true, detail: 'Done' });
      },
    },
    profileOfWatch: (): string | null => watchProfile,
  };
}

function event(change: Partial<PlannerItemInput>): PlannerItemRow {
  const base: PlannerItemInput = {
    profile_id: owner.profileId,
    collection_id: collectionId,
    kind: 'event',
    parent_id: null,
    title: 'Standup',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-07T10:00',
    end_local: '2026-11-07T10:30',
    time_zone: ZONE,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [{ minutes_before: 10 }],
    google: null,
    created_by: 'person',
    ...change,
  };
  return test.store.plannerItems.insert({ ...base, ...instantsOf(base) });
}

function addWatch(): void {
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
        config: { settings: [], alarms: [], faces: [], goals: [], sports: [] },
      },
    },
  ]);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: ZONE });
  owner = addPerson(test, 'Owner', 'owner');
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
  order = [];
  summaries = [];
  watchSends = [];
  listeners = new Set();
  reminderPull.mockClear();
  sync.mockClear();
  test.store.feed.subscribeNotices((notice) => {
    if (notice.type === 'planner_summary') summaries.push(PLANNER_SUMMARY_NOTICE.parse(notice));
  });
  runtime = new PlannerRuntime({
    store: test.store,
    clock,
    signals: {
      emit: (signal: SignalInput): void => {
        for (const listener of listeners) listener(signal);
      },
      subscribe: (listener: SignalListener): (() => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    submit: (): never[] => [],
    google: { reminderPull, sync },
    log: testLogger(),
  });
});

afterEach(async () => {
  runtime.stop();
  await test.close();
});

describe('planner runtime', () => {
  it('publishes the summary of every person when it starts', () => {
    runtime.start(channels(null));
    expect(summaries.map((summary) => summary.personId)).toContain(owner.profileId);
  });

  it('pulls Google before a reminder of a Google event rings', async () => {
    runtime.start(channels(null));
    const meeting = event({
      google: { id: 'g1', calendarOrListId: 'c1', etag: null, base: {}, state: 'synced' },
    });
    clock.advanceTo('2026-11-07T09:50:00.000Z');
    await vi.waitFor(() => {
      expect(test.store.plannerRings.forRef('reminder', meeting.id)).toHaveLength(1);
    });
    expect(reminderPull).toHaveBeenCalledOnce();
    expect(order[0]).toBe(`pull:${meeting.id}`);
  });

  it('listens to the signal bus for completions and lets go on stop', () => {
    runtime.start(channels(null));
    expect(listeners.size).toBe(1);
    runtime.stop();
    expect(listeners.size).toBe(0);
  });

  it('pulls Google and pushes the calendar to the watch when the preferences change', async () => {
    addWatch();
    runtime.start(channels(owner.profileId));
    event({});
    await settle();
    order.length = 0;
    watchSends.length = 0;
    runtime.preferencesChanged(owner.profileId);
    await vi.waitFor(() => {
      expect(watchSends.map((action) => action.type)).toContain('set_calendar');
    });
    expect(order.indexOf(`sync:${owner.profileId}`)).toBeLessThan(
      order.indexOf('watch:set_calendar'),
    );
  });

  it('disarms every alarm and reminder on stop', () => {
    runtime.start(channels(null));
    event({});
    test.store.plannerAlarms.insert({
      profile_id: owner.profileId,
      label: 'Work',
      time: '07:00',
      days: [1, 2, 3, 4, 5],
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
      targets: [],
      watch: [],
      source: 'planner',
    });
    expect(clock.pending().length).toBeGreaterThan(0);
    runtime.stop();
    expect(clock.pending()).toEqual([]);
  });
});
