import {
  PLANNER_RING_NOTICE,
  PLANNER_SIGNAL,
  type PlannerRingNotice,
  type PlannerSignal,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { StopwatchService } from '../../src/planner/stopwatch';
import { TimerService } from '../../src/planner/timers';
import { openStore, type Store } from '../../src/store/store';
import { testLogger } from '../support/logs';
import { testStore, type TestStore, unusedDrivePath } from '../support/store';

const START = '2026-11-07T08:00:00.000Z';

let test: TestStore;
let clock: SimulatedClock;
let profileId: string;
let notices: PlannerRingNotice[];
let signals: PlannerSignal[];
let timers: TimerService;
let stopwatch: StopwatchService;

function timerService(): TimerService {
  return new TimerService({
    store: test.store,
    clock,
    ports: {
      ring: (notice, owner): void => {
        expect(owner).toBe(profileId);
        notices.push(PLANNER_RING_NOTICE.parse(notice));
      },
      signal: (signal): void => {
        signals.push(PLANNER_SIGNAL.parse(signal));
      },
    },
    log: testLogger('timers'),
  });
}

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(clock.now);
  profileId = test.store.profiles.create({ name: 'Ann' }).id;
  notices = [];
  signals = [];
  timers = timerService();
  stopwatch = new StopwatchService({ store: test.store, clock });
  timers.start();
});

afterEach(async () => {
  timers.stop();
  await test.close();
});

const begin = (durationMs: number, label: string | null = null): PlannerTimerRow =>
  timers.begin(profileId, { durationMs, label, targets: [] });

describe('timers', () => {
  it('stores an absolute end instant and rings with a notice and a signal when it is reached', () => {
    const timer = begin(600_000, 'Tea');
    expect(timer).toMatchObject({ state: 'running', ends_at: '2026-11-07T08:10:00.000Z' });
    clock.advanceTo('2026-11-07T08:09:59.000Z');
    expect(notices).toHaveLength(0);
    clock.advanceTo('2026-11-07T08:10:00.000Z');
    const done = test.store.plannerTimers.byId(timer.id, profileId);
    expect(done).toMatchObject({ state: 'done', ends_at: null, remaining_ms: null });
    const ring = test.store.plannerRings.forRef('timer', timer.id)[0];
    expect(ring).toMatchObject({ outcome: 'rang', due_at: '2026-11-07T08:10:00.000Z' });
    expect(notices).toEqual([
      {
        type: 'planner_ring',
        ringId: ring?.id,
        kind: 'timer',
        refId: timer.id,
        dueAt: '2026-11-07T08:10:00.000Z',
      },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'timer_done',
      subject: timer.id,
      profileId,
      data: { timerId: timer.id, label: 'Tea', durationMs: 600_000 },
    });
  });

  it('pauses with the remaining time and resumes to a new end instant', () => {
    const timer = begin(600_000);
    clock.jumpTo('2026-11-07T08:04:00.000Z');
    const paused = timers.pause(timer.id, profileId);
    expect(paused).toMatchObject({ state: 'paused', ends_at: null, remaining_ms: 360_000 });
    expect(clock.pending()).toEqual([]);
    clock.jumpTo('2026-11-07T09:00:00.000Z');
    const resumed = timers.resume(timer.id, profileId);
    expect(resumed).toMatchObject({ state: 'running', ends_at: '2026-11-07T09:06:00.000Z' });
    clock.advanceTo('2026-11-07T09:06:00.000Z');
    expect(notices).toHaveLength(1);
  });

  it('adds time to a running, a paused and a finished timer', () => {
    const running = begin(60_000);
    expect(timers.addTime(running.id, profileId, 30_000)).toMatchObject({
      duration_ms: 90_000,
      ends_at: '2026-11-07T08:01:30.000Z',
    });
    timers.pause(running.id, profileId);
    expect(timers.addTime(running.id, profileId, 10_000)).toMatchObject({
      state: 'paused',
      remaining_ms: 100_000,
    });
    const quick = begin(1_000);
    clock.advanceTo('2026-11-07T08:00:01.000Z');
    expect(notices).toHaveLength(1);
    const again = timers.addTime(quick.id, profileId, 5_000);
    expect(again).toMatchObject({ state: 'running', ends_at: '2026-11-07T08:00:06.000Z' });
    expect(test.store.plannerRings.forRef('timer', quick.id)[0]?.dismissed_at).not.toBeNull();
  });

  it('cancels a timer so it never rings, and dismisses a ringing one', () => {
    const cancelled = begin(5_000);
    timers.cancelTimer(cancelled.id, profileId);
    const ringing = begin(1_000);
    clock.advanceTo('2026-11-07T08:00:10.000Z');
    expect(notices.map((notice) => notice.refId)).toEqual([ringing.id]);
    timers.cancelTimer(ringing.id, profileId);
    expect(test.store.plannerRings.ringing(profileId)).toEqual([]);
    expect(test.store.plannerTimers.byId(cancelled.id, profileId).state).toBe('cancelled');
  });

  it('rings several timers in order and re-arms for the next', () => {
    begin(2_000, 'two');
    begin(1_000, 'one');
    clock.advanceTo('2026-11-07T08:00:02.000Z');
    expect(signals.map((signal) => signal.data)).toMatchObject([
      { label: 'one' },
      { label: 'two' },
    ]);
  });

  it('records a timer that ended while the hub was down as missed and does not ring', () => {
    const timer = begin(60_000);
    timers.stop();
    clock.jumpTo('2026-11-07T08:30:00.000Z');
    timers = timerService();
    timers.start();
    expect(test.store.plannerTimers.byId(timer.id, profileId).state).toBe('done');
    expect(test.store.plannerRings.forRef('timer', timer.id)[0]).toMatchObject({
      outcome: 'missed',
      missed_reason: 'hub_down',
      rang_at: null,
    });
    expect(notices).toHaveLength(0);
    expect(signals).toHaveLength(0);
  });

  it('re-arms a running timer after a restart so it still rings', () => {
    const timer = begin(120_000);
    timers.stop();
    timers = timerService();
    timers.start();
    clock.advanceTo('2026-11-07T08:02:00.000Z');
    expect(notices.map((notice) => notice.refId)).toEqual([timer.id]);
  });

  it('keeps timers of another person out of reach', () => {
    const timer = begin(60_000);
    const other = test.store.profiles.create({ name: 'Bob' }).id;
    expect(() => timers.pause(timer.id, other)).toThrow();
  });
});

describe('stopwatch', () => {
  it('accumulates across pauses and keeps laps with their splits', () => {
    stopwatch.begin(profileId);
    clock.jumpTo('2026-11-07T08:00:10.000Z');
    stopwatch.lap(profileId);
    clock.jumpTo('2026-11-07T08:00:25.000Z');
    const paused = stopwatch.pause(profileId);
    expect(paused).toMatchObject({ running: false, started_at: null, accumulated_ms: 25_000 });
    clock.jumpTo('2026-11-07T09:00:00.000Z');
    stopwatch.begin(profileId);
    clock.jumpTo('2026-11-07T09:00:05.000Z');
    const lapped = stopwatch.lap(profileId);
    expect(lapped.laps).toEqual([
      { elapsed_ms: 10_000, split_ms: 10_000 },
      { elapsed_ms: 30_000, split_ms: 20_000 },
    ]);
  });

  it('refuses a lap while stopped and ignores a second start', () => {
    expect(() => stopwatch.lap(profileId)).toThrow('Start the stopwatch');
    const first = stopwatch.begin(profileId);
    clock.jumpTo('2026-11-07T08:00:05.000Z');
    expect(stopwatch.begin(profileId).started_at).toBe(first.started_at);
  });

  it('resets to zero and clears the laps', () => {
    stopwatch.begin(profileId);
    clock.jumpTo('2026-11-07T08:00:03.000Z');
    stopwatch.lap(profileId);
    expect(stopwatch.reset(profileId)).toMatchObject({
      running: false,
      started_at: null,
      accumulated_ms: 0,
      laps: [],
    });
  });

  it('is one stopwatch per person', () => {
    const other = test.store.profiles.create({ name: 'Bob' }).id;
    stopwatch.begin(profileId);
    expect(stopwatch.read(other).running).toBe(false);
  });
});

describe('survives a reload', () => {
  it('keeps stopwatch laps, a paused timer and a running timer after the store is reopened', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'planner-reload-'));
    const path = join(directory, 'reload.db');
    const open = (): Store =>
      openStore({
        path,
        log: testLogger('store'),
        now: clock.now,
        systemTimeZone: 'UTC',
        drivePathOf: unusedDrivePath,
      });
    const first = open();
    const owner = first.profiles.create({ name: 'Ann' }).id;
    const laps = new StopwatchService({ store: first, clock });
    laps.begin(owner);
    clock.jumpTo('2026-11-07T08:00:07.000Z');
    laps.lap(owner);
    laps.pause(owner);
    const service = new TimerService({
      store: first,
      clock,
      ports: { ring: (): void => undefined, signal: (): void => undefined },
      log: testLogger('timers'),
    });
    const paused = service.begin(owner, { durationMs: 60_000, label: null, targets: [] });
    service.pause(paused.id, owner);
    const running = service.begin(owner, { durationMs: 90_000, label: 'Pasta', targets: [] });
    service.stop();
    first.close();

    const second = open();
    const reloaded = new StopwatchService({ store: second, clock }).read(owner);
    expect(reloaded).toMatchObject({
      running: false,
      accumulated_ms: 7_000,
      laps: [{ elapsed_ms: 7_000, split_ms: 7_000 }],
    });
    expect(second.plannerTimers.byId(paused.id, owner)).toMatchObject({
      state: 'paused',
      remaining_ms: 60_000,
    });
    expect(second.plannerTimers.byId(running.id, owner)).toMatchObject({
      state: 'running',
      ends_at: '2026-11-07T08:01:37.000Z',
    });
    second.close();
    await rm(directory, { recursive: true, force: true });
  });
});
