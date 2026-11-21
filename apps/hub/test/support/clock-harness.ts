import type { PlannerRadioResult } from '@smarteverything/domain';
import { SimulatedClock } from '../../src/clock/simulated';
import { AlarmSoundCheck } from '../../src/planner/alarm-sound-check';
import { AlarmScheduler } from '../../src/planner/alarms';
import { PhoneRings } from '../../src/planner/phone-rings';
import { loadPlannerPreferences } from '../../src/planner/preferences';
import { RingDesk } from '../../src/planner/rings';
import { StopwatchService } from '../../src/planner/stopwatch';
import { SunriseRamp } from '../../src/planner/sunrise';
import { TimerService } from '../../src/planner/timers';
import { WakeRoutine } from '../../src/planner/wake-routine';
import type { Caller } from '../../src/server/auth';
import { plannerClockRoutes } from '../../src/server/handlers/planner-clock';
import type { Bound } from '../../src/server/router';
import { advanceSettled } from './host-settle';
import { testLogger } from './logs';
import { addPerson, type TestPerson } from './phone-fixtures';
import { testStore, type TestStore } from './store';

export const START = '2026-11-07T08:00:00.000Z';
export const STATION: PlannerRadioResult = {
  station_id: '598c4d0e-6b06-43fb-bff4-717c591213a9',
  name: 'BBC World Service',
  url: 'https://stream.example.test/world',
  country: 'United Kingdom',
  bitrate: 56,
  codec: 'MP3',
};
export const MISSING = '7f3b7c9e-2a41-4d0e-9a53-1f1d5c8e6a10';

export interface ClockHarness {
  test: TestStore;
  clock: SimulatedClock;
  owner: TestPerson;
  ann: TestPerson;
  bob: TestPerson;
  scheduler: AlarmScheduler;
  timers: TimerService;
  phoneRings: PhoneRings;
  routes: ReturnType<typeof plannerClockRoutes>;
  advance: (at: string) => Promise<void>;
  close: () => Promise<void>;
}

export const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

export const call = (
  route: Bound,
  person: TestPerson,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

function alarmScheduler(test: TestStore, clock: SimulatedClock): AlarmScheduler {
  const rings = new RingDesk({
    store: test.store,
    clock,
    emit: (): void => undefined,
    log: testLogger(),
  });
  const wake = new WakeRoutine({
    clock,
    runAutomation: (): Promise<void> => Promise.resolve(),
    log: testLogger(),
  });
  const sunrise = new SunriseRamp({
    store: test.store,
    clock,
    submit: (): Promise<never[]> => Promise.resolve([]),
    log: testLogger(),
  });
  return new AlarmScheduler({
    store: test.store,
    clock,
    rings,
    wake,
    sunrise,
    log: testLogger(),
  });
}

async function clockServices(
  test: TestStore,
  clock: SimulatedClock,
  scheduler: AlarmScheduler,
): Promise<{
  sounds: AlarmSoundCheck;
  preferencesOf: (profileId: string) => ReturnType<typeof loadPlannerPreferences>;
  timers: TimerService;
  phoneRings: PhoneRings;
}> {
  const sounds = new AlarmSoundCheck(test.store);
  const preferencesOf = (profileId: string): ReturnType<typeof loadPlannerPreferences> =>
    loadPlannerPreferences(test.store, profileId);
  const timers = new TimerService({
    store: test.store,
    clock,
    ports: { ring: (): void => undefined, signal: (): void => undefined },
    log: testLogger(),
  });
  const phoneRings = new PhoneRings({
    store: test.store,
    channel: { send: (): Promise<boolean> => Promise.resolve(true) },
    now: clock.now,
    log: testLogger(),
  });
  await scheduler.start();
  await timers.start();
  phoneRings.start();
  return { sounds, preferencesOf, timers, phoneRings };
}

export async function buildClockHarness(): Promise<ClockHarness> {
  const clock = new SimulatedClock(START);
  const test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: 'UTC' });
  const owner = addPerson(test, 'Owner', 'owner');
  const ann = addPerson(test, 'Ann', 'member');
  const bob = addPerson(test, 'Bob', 'member');
  const scheduler = alarmScheduler(test, clock);
  const { sounds, preferencesOf, timers, phoneRings } = await clockServices(test, clock, scheduler);
  const routes = plannerClockRoutes(
    { store: test.store },
    {
      preferencesOf,
      alarms: scheduler,
      timers,
      stopwatch: new StopwatchService({ store: test.store, clock }),
      phoneRings,
      sounds,
      radio: { search: (): Promise<PlannerRadioResult[]> => Promise.resolve([STATION]) },
    },
  );

  return {
    test,
    clock,
    owner,
    ann,
    bob,
    scheduler,
    timers,
    phoneRings,
    routes,
    advance: (at): Promise<void> =>
      advanceSettled(clock, at, async () => {
        await scheduler.settled();
        await timers.settled();
        await phoneRings.settled();
      }),
    close: async (): Promise<void> => {
      await phoneRings.settled();
      phoneRings.stop();
      timers.stop();
      scheduler.stop();
      await test.close();
    },
  };
}
