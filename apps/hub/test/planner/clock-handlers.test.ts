import {
  PLANNER_ALARM_ROW,
  PLANNER_PHONE_RING_SET,
  PLANNER_RING_ROW,
  PLANNER_STOPWATCH_ROW,
  PLANNER_TIMER_ROW,
  type PlannerAlarmRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { AlarmScheduler } from '../../src/planner/alarms';
import { PhoneRings } from '../../src/planner/phone-rings';
import { plannerPreferencesOf } from '../../src/planner/preferences';
import { RingDesk } from '../../src/planner/rings';
import { StopwatchService } from '../../src/planner/stopwatch';
import { TimerService } from '../../src/planner/timers';
import { WakeRoutine } from '../../src/planner/wake-routine';
import type { Caller } from '../../src/server/auth';
import { plannerClockRoutes } from '../../src/server/handlers/planner-clock';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const START = '2026-11-07T08:00:00.000Z';
const MISSING = '7f3b7c9e-2a41-4d0e-9a53-1f1d5c8e6a10';

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let scheduler: AlarmScheduler;
let timers: TimerService;
let phoneRings: PhoneRings;
let routes: ReturnType<typeof plannerClockRoutes>;

const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

const call = (
  route: Bound,
  person: TestPerson,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

const alarm = async (person: TestPerson, body: object): Promise<PlannerAlarmRow> =>
  PLANNER_ALARM_ROW.parse(await call(routes.createPlannerAlarm, person, { body }));

const timer = async (person: TestPerson, durationMs: number): Promise<{ id: string }> =>
  PLANNER_TIMER_ROW.parse(
    await call(routes.startPlannerTimer, person, { body: { duration_ms: durationMs } }),
  );

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: 'UTC' });
  owner = addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  const rings = new RingDesk({
    store: test.store,
    clock,
    emit: (): void => undefined,
    log: testLogger(),
  });
  const wake = new WakeRoutine({
    clock,
    runScene: (): Promise<void> => Promise.resolve(),
    log: testLogger(),
  });
  scheduler = new AlarmScheduler({ store: test.store, clock, rings, wake, log: testLogger() });
  timers = new TimerService({
    store: test.store,
    clock,
    ports: { ring: (): void => undefined, signal: (): void => undefined },
    log: testLogger(),
  });
  phoneRings = new PhoneRings({
    store: test.store,
    channel: { send: (): Promise<boolean> => Promise.resolve(true) },
    now: clock.now,
    log: testLogger(),
  });
  scheduler.start();
  timers.start();
  phoneRings.start();
  routes = plannerClockRoutes(
    { store: test.store },
    {
      now: clock.now,
      preferencesOf: (profileId): ReturnType<typeof plannerPreferencesOf> =>
        plannerPreferencesOf(test.store, profileId),
      alarms: scheduler,
      timers,
      stopwatch: new StopwatchService({ store: test.store, clock }),
      phoneRings,
    },
  );
});

afterEach(async () => {
  phoneRings.stop();
  timers.stop();
  scheduler.stop();
  await test.close();
});

describe('alarms', () => {
  it('adds an alarm with the stored person defaults', async () => {
    const made = await alarm(ann, { time: '07:00', days: [1, 2, 3, 4, 5], label: 'Work' });
    const defaults = plannerPreferencesOf(test.store, ann.profileId).clock;
    expect(made).toMatchObject({
      profile_id: ann.profileId,
      time: '07:00',
      enabled: true,
      source: 'planner',
      watch: [],
      sound: defaults.sound,
      ramp_seconds: defaults.ramp_seconds,
      snooze_minutes: defaults.snooze_minutes,
    });
  });

  it('refuses a ring target and a wake scene that do not exist', async () => {
    await expect(
      call(routes.createPlannerAlarm, ann, {
        body: { time: '07:00', targets: [{ kind: 'client', clientId: MISSING }] },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      call(routes.createPlannerAlarm, ann, {
        body: { time: '07:00', wake_scene_id: MISSING, wake_lead_minutes: 10 },
      }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
  });

  it('changes and deletes an alarm and keeps another member out', async () => {
    const made = await alarm(ann, { time: '07:00' });
    const changed = PLANNER_ALARM_ROW.parse(
      await call(routes.updatePlannerAlarm, ann, {
        params: { alarmId: made.id },
        body: { time: '06:30', label: 'Early' },
      }),
    );
    expect(changed).toMatchObject({ time: '06:30', label: 'Early' });
    await expect(
      call(routes.updatePlannerAlarm, bob, {
        params: { alarmId: made.id },
        body: { enabled: false },
      }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
    await expect(
      call(routes.deletePlannerAlarm, bob, { params: { alarmId: made.id } }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
    await expect(
      call(routes.deletePlannerAlarm, ann, { params: { alarmId: made.id } }),
    ).resolves.toEqual({ ok: true });
    expect(test.store.plannerAlarms.find(made.id, ann.profileId)).toBeUndefined();
  });

  it('rejects a change that leaves both a date and weekdays', async () => {
    const made = await alarm(ann, { time: '07:00', days: [1] });
    await expect(
      call(routes.updatePlannerAlarm, ann, {
        params: { alarmId: made.id },
        body: { once_on: '2026-11-20' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('lets the owner act for a person and refuses a member acting for another', async () => {
    const made = await alarm(owner, { time: '07:00' });
    expect(made.profile_id).toBe(owner.profileId);
    const forAnn = PLANNER_ALARM_ROW.parse(
      await call(routes.createPlannerAlarm, owner, {
        query: { personId: ann.profileId },
        body: { time: '08:15' },
      }),
    );
    expect(forAnn.profile_id).toBe(ann.profileId);
    await expect(
      call(routes.createPlannerAlarm, ann, {
        query: { personId: bob.profileId },
        body: { time: '08:15' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('skips the next ring of a repeating alarm and refuses a one-off', async () => {
    const weekdays = await alarm(ann, { time: '09:00', days: [1, 2, 3, 4, 5] });
    const skipped = PLANNER_ALARM_ROW.parse(
      await call(routes.skipNextPlannerAlarm, ann, { params: { alarmId: weekdays.id } }),
    );
    expect(skipped.skip_on).toBe('2026-11-09');
    const once = await alarm(ann, { time: '09:00', once_on: '2026-11-20' });
    await expect(
      call(routes.skipNextPlannerAlarm, ann, { params: { alarmId: once.id } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('ringing alarms', () => {
  async function ringing(person: TestPerson): Promise<{ alarmId: string; ringId: string }> {
    const made = await alarm(person, { time: '08:30' });
    clock.advanceTo('2026-11-07T08:30:00.000Z');
    const [ring] = test.store.plannerRings.forRef('alarm', made.id);
    if (ring === undefined) throw new Error('The alarm did not ring.');
    return { alarmId: made.id, ringId: ring.id };
  }

  it('snoozes by the alarm length and dismisses the ring', async () => {
    const { alarmId, ringId } = await ringing(ann);
    const snoozed = PLANNER_RING_ROW.parse(
      await call(routes.snoozePlannerAlarm, ann, { params: { alarmId }, body: { ringId } }),
    );
    expect(snoozed).toMatchObject({ id: ringId, snoozes: 1, dismissed_at: null });
    expect(Date.parse(snoozed.rang_at ?? '')).toBe(Date.parse('2026-11-07T08:39:00.000Z'));
    const dismissed = PLANNER_RING_ROW.parse(
      await call(routes.dismissPlannerAlarm, ann, { params: { alarmId }, body: { ringId } }),
    );
    expect(dismissed.dismissed_at).not.toBeNull();
    await expect(
      call(routes.dismissPlannerAlarm, ann, { params: { alarmId }, body: { ringId } }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('keeps a ring of another person and another alarm out of reach', async () => {
    const { alarmId, ringId } = await ringing(ann);
    await expect(
      call(routes.dismissPlannerAlarm, bob, { params: { alarmId }, body: { ringId } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      call(routes.dismissPlannerAlarm, ann, { params: { alarmId: MISSING }, body: { ringId } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lists the rings of the window for the caller only', async () => {
    await ringing(ann);
    const window = { from: '2026-11-07T00:00:00.000Z', to: '2026-11-08T00:00:00.000Z' };
    const mine = z
      .array(PLANNER_RING_ROW)
      .parse(await call(routes.listPlannerRings, ann, { query: window }));
    expect(mine).toHaveLength(1);
    const theirs = z
      .array(PLANNER_RING_ROW)
      .parse(await call(routes.listPlannerRings, bob, { query: window }));
    expect(theirs).toEqual([]);
    const later = z.array(PLANNER_RING_ROW).parse(
      await call(routes.listPlannerRings, ann, {
        query: { from: '2026-11-08T00:00:00.000Z', to: '2026-11-09T00:00:00.000Z' },
      }),
    );
    expect(later).toEqual([]);
  });
});

describe('timers', () => {
  it('starts, pauses, resumes, extends and cancels a timer', async () => {
    const started = await timer(ann, 600_000);
    const params = { timerId: started.id };
    const paused = PLANNER_TIMER_ROW.parse(await call(routes.pausePlannerTimer, ann, { params }));
    expect(paused).toMatchObject({ state: 'paused', remaining_ms: 600_000 });
    const resumed = PLANNER_TIMER_ROW.parse(await call(routes.resumePlannerTimer, ann, { params }));
    expect(resumed).toMatchObject({ state: 'running', ends_at: '2026-11-07T08:10:00.000Z' });
    const longer = PLANNER_TIMER_ROW.parse(
      await call(routes.addPlannerTimerTime, ann, { params, body: { ms: 60_000 } }),
    );
    expect(longer.ends_at).toBe('2026-11-07T08:11:00.000Z');
    const cancelled = PLANNER_TIMER_ROW.parse(
      await call(routes.cancelPlannerTimer, ann, { params }),
    );
    expect(cancelled.state).toBe('cancelled');
  });

  it('keeps a timer of another member out and refuses a resume of a running one', async () => {
    const started = await timer(ann, 60_000);
    const params = { timerId: started.id };
    await expect(call(routes.pausePlannerTimer, bob, { params })).rejects.toMatchObject({
      name: 'StoreNotFoundError',
    });
    await expect(call(routes.resumePlannerTimer, ann, { params })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('finishes a started timer on the clock', async () => {
    const started = await timer(ann, 60_000);
    clock.advanceTo('2026-11-07T08:01:00.000Z');
    expect(test.store.plannerTimers.byId(started.id, ann.profileId).state).toBe('done');
  });
});

describe('stopwatch', () => {
  const run = async (
    route: Bound,
    person: TestPerson,
  ): Promise<z.infer<typeof PLANNER_STOPWATCH_ROW>> =>
    PLANNER_STOPWATCH_ROW.parse(await call(route, person));

  it('runs, laps, pauses and resets for the caller', async () => {
    await run(routes.startPlannerStopwatch, ann);
    clock.advanceTo('2026-11-07T08:00:10.000Z');
    const lapped = await run(routes.lapPlannerStopwatch, ann);
    expect(lapped.laps).toEqual([{ elapsed_ms: 10_000, split_ms: 10_000 }]);
    clock.advanceTo('2026-11-07T08:00:25.000Z');
    const paused = await run(routes.pausePlannerStopwatch, ann);
    expect(paused).toMatchObject({ running: false, accumulated_ms: 25_000 });
    await expect(run(routes.lapPlannerStopwatch, bob)).rejects.toMatchObject({
      code: 'conflict',
    });
    const reset = await run(routes.resetPlannerStopwatch, ann);
    expect(reset).toMatchObject({ accumulated_ms: 0, laps: [] });
  });
});

describe('phone rings', () => {
  const read = async (person: TestPerson, clientId: string): Promise<unknown> =>
    call(routes.readPlannerPhoneRings, person, { query: { clientId } });

  it('reads the next ring of every alarm and the end of every timer for the phone', async () => {
    const target = { kind: 'client', clientId: ann.client.id };
    const weekdays = await alarm(ann, { time: '07:00', days: [1, 2, 3, 4, 5], targets: [target] });
    const started = PLANNER_TIMER_ROW.parse(
      await call(routes.startPlannerTimer, ann, {
        body: { duration_ms: 600_000, targets: [target] },
      }),
    );
    const set = PLANNER_PHONE_RING_SET.parse(await read(ann, ann.client.id));
    expect(set.rings).toEqual([
      expect.objectContaining({
        ringKey: `alarm:${weekdays.id}`,
        kind: 'alarm',
        refId: weekdays.id,
        dueAt: '2026-11-09T07:00:00.000Z',
      }),
      expect.objectContaining({
        ringKey: `timer:${started.id}`,
        kind: 'timer',
        refId: started.id,
        dueAt: '2026-11-07T08:10:00.000Z',
      }),
    ]);
    expect(set.hash).toBe(phoneRings.desired(ann.client.id).version);
  });

  it('leaves a one-off alarm that has passed out of the set', async () => {
    const target = { kind: 'client', clientId: ann.client.id };
    await alarm(ann, { time: '06:00', once_on: '2026-11-07', targets: [target] });
    const set = PLANNER_PHONE_RING_SET.parse(await read(ann, ann.client.id));
    expect(set.rings).toEqual([]);
  });

  it('keeps the ring set of another person phone out of reach', async () => {
    await expect(read(bob, ann.client.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      call(routes.ackPlannerPhoneRings, bob, {
        body: { clientId: ann.client.id, hash: 'anything' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('records the ack of the current hash and refuses a stale one', async () => {
    const target = { kind: 'client', clientId: ann.client.id };
    await alarm(ann, { time: '07:00', targets: [target] });
    const { hash } = PLANNER_PHONE_RING_SET.parse(await read(ann, ann.client.id));
    await expect(
      call(routes.ackPlannerPhoneRings, ann, { body: { clientId: ann.client.id, hash } }),
    ).resolves.toEqual({ ok: true });
    expect(phoneRings.stateOf(ann.client.id)?.ackedAt).toBe(START);
    await expect(
      call(routes.ackPlannerPhoneRings, ann, {
        body: { clientId: ann.client.id, hash: 'stale' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
