import { ApiError, type DeviceTarget, type JsonValue } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EnsureNotConfirmedError,
  DeviceEnsurer,
  type DeviceEnsureRequest,
} from '../../../src/automations/effects/device-ensure';
import { DeviceFader, fadeLevels } from '../../../src/automations/effects/device-fade';
import { DeviceRestorer } from '../../../src/automations/effects/device-restore';
import type { DeviceSetRequest } from '../../../src/automations/effects/device-set';
import { reportedWithin } from '../../../src/automations/effects/reported-value';
import { actionsOfSnapshot, captureScene } from '../../../src/automations/effects/scene-capture';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { closeSetups, NOW, setup } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { testRun } from './support';

afterEach(closeSetups);

const STAMP = { nodePath: 'node', iteration: 0, attempt: 1 };
const TARGET: DeviceTarget = { kind: 'devices', deviceIds: ['lamp'] };

function recordingSetter(refuse: (request: DeviceSetRequest) => boolean = () => false): {
  readonly calls: DeviceSetRequest[];
  readonly set: (request: DeviceSetRequest) => Promise<{
    sent: string[];
    skipped: never[];
    note: null;
  }>;
} {
  const calls: DeviceSetRequest[] = [];
  return {
    calls,
    set: (request): ReturnType<ReturnType<typeof recordingSetter>['set']> => {
      calls.push(request);
      if (refuse(request)) return Promise.reject(new ApiError('command_refused', 'offline'));
      return Promise.resolve({ sent: ['lamp'], skipped: [], note: null });
    },
  };
}

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe('reported value wait', () => {
  it('resolves at once when the value already holds', async () => {
    const home = await setup();
    const clock = new FakeClock(NOW.toISOString());
    const wait = { feed: home.db.store.feed, clock, holds: (): boolean => true, withinMs: 1000 };
    await expect(reportedWithin(wait, testRun())).resolves.toBe(true);
    expect(clock.pending()).toEqual([]);
  });

  it('resolves when the device reports the value, without waiting for the timer', async () => {
    const home = await setup();
    const clock = new FakeClock(NOW.toISOString());
    let reported = false;
    const waiting = reportedWithin(
      { feed: home.db.store.feed, clock, holds: () => reported, withinMs: 5000 },
      testRun(),
    );
    reported = true;
    home.db.store.state.write([
      { deviceId: home.lampId, capability: 'power', value: true, observedAt: NOW.toISOString() },
    ]);
    await expect(waiting).resolves.toBe(true);
    expect(clock.pending()).toEqual([]);
  });

  it('gives up when the time runs out and stops when the run is cancelled', async () => {
    const home = await setup();
    const clock = new FakeClock(NOW.toISOString());
    const base = { feed: home.db.store.feed, clock, holds: (): boolean => false, withinMs: 1000 };
    const late = reportedWithin(base, testRun());
    clock.advanceTo('2026-10-08T12:00:02.000Z');
    await expect(late).resolves.toBe(false);
    const run = testRun();
    const cancelled = reportedWithin(base, run);
    run.controller.abort();
    await expect(cancelled).rejects.toBeInstanceOf(AutomationRunCancelledError);
  });
});

describe('device ensure', () => {
  const ask: DeviceEnsureRequest = {
    target: TARGET,
    control: 'power',
    value: true,
    percent: false,
    tries: 3,
    verifyWithinMs: 1000,
    at: STAMP,
  };

  async function ensurer(seen: () => JsonValue | undefined): Promise<{
    ensurer: DeviceEnsurer;
    setter: ReturnType<typeof recordingSetter>;
    clock: FakeClock;
  }> {
    const home = await setup();
    const clock = new FakeClock(NOW.toISOString());
    const setter = recordingSetter();
    return {
      setter,
      clock,
      ensurer: new DeviceEnsurer({ setter, feed: home.db.store.feed, clock, reported: seen }),
    };
  }

  it('is done after one send when the device reports the value', async () => {
    const { ensurer: made, setter } = await ensurer(() => true);
    await expect(made.ensure(ask, testRun())).resolves.toMatchObject({
      attempts: 1,
      sent: ['lamp'],
    });
    expect(setter.calls).toHaveLength(1);
  });

  it('sends again with a new attempt number until the value is reported', async () => {
    let reports = 0;
    const { ensurer: made, setter, clock } = await ensurer(() => (reports > 0 ? true : undefined));
    const done = made.ensure(ask, testRun());
    await flush();
    clock.advanceTo('2026-10-08T12:00:01.000Z');
    await flush();
    reports = 1;
    clock.advanceTo('2026-10-08T12:00:02.000Z');
    await expect(done).resolves.toMatchObject({ attempts: 2 });
    expect(setter.calls.map((call) => call.at?.attempt)).toEqual([1, 2]);
  });

  it('fails as not confirmed after the last try', async () => {
    const { ensurer: made, setter, clock } = await ensurer(() => false);
    const failed = made.ensure({ ...ask, tries: 2 }, testRun());
    const outcome = expect(failed).rejects.toBeInstanceOf(EnsureNotConfirmedError);
    await flush();
    clock.advanceTo('2026-10-08T12:00:01.000Z');
    await flush();
    clock.advanceTo('2026-10-08T12:00:02.000Z');
    await outcome;
    expect(setter.calls).toHaveLength(2);
  });
});

describe('device fade', () => {
  it('plans even or eased levels that end exactly on the target', () => {
    expect(fadeLevels({ from: 0, to: 100, overMs: 4000, curve: 'linear' })).toEqual([
      25, 50, 75, 100,
    ]);
    const eased = fadeLevels({ from: 0, to: 100, overMs: 4000, curve: 'ease' });
    expect(eased.at(-1)).toBe(100);
    expect(eased[0]).toBeLessThan(25);
  });

  it('uses fewer steps for a larger step size and one step for a short fade', () => {
    expect(fadeLevels({ from: 0, to: 100, overMs: 60_000, curve: 'linear', step: 50 })).toEqual([
      50, 100,
    ]);
    expect(fadeLevels({ from: 10, to: 20, overMs: 100, curve: 'linear' })).toEqual([20]);
    expect(fadeLevels({ from: 80, to: 20, overMs: 3000, curve: 'linear' })).toEqual([60, 40, 20]);
  });

  it('sends each level with a pause between them', async () => {
    const setter = recordingSetter();
    const clock = new FakeClock(NOW.toISOString());
    const done = new DeviceFader(setter, clock).fade(
      {
        target: TARGET,
        control: 'brightness',
        from: 0,
        to: 100,
        overMs: 2000,
        curve: 'linear',
        percent: false,
        at: STAMP,
      },
      testRun(),
    );
    await flush();
    expect(setter.calls.map((call) => call.value())).toEqual([50]);
    clock.advanceTo('2026-10-08T12:00:01.000Z');
    await expect(done).resolves.toMatchObject({ sent: ['lamp'], last: 100 });
    expect(setter.calls.map((call) => call.at?.iteration)).toEqual([0, 1]);
  });

  it('stops at the current level when the run is cancelled', async () => {
    const setter = recordingSetter();
    const run = testRun();
    const done = new DeviceFader(setter, new FakeClock(NOW.toISOString())).fade(
      {
        target: TARGET,
        control: 'brightness',
        from: 0,
        to: 100,
        overMs: 4000,
        curve: 'linear',
        percent: false,
        at: STAMP,
      },
      run,
    );
    const outcome = expect(done).rejects.toBeInstanceOf(AutomationRunCancelledError);
    await flush();
    run.controller.abort();
    await outcome;
    expect(setter.calls).toHaveLength(1);
  });
});

describe('device restore', () => {
  it('sets power last and reports a refused member as skipped', async () => {
    const setter = recordingSetter(
      (request) => request.target.kind === 'devices' && request.target.deviceIds[0] === 'gone',
    );
    const result = await new DeviceRestorer(setter).restore(
      { lamp: { power: false, brightness: 30 }, gone: { power: true } },
      STAMP,
      testRun(),
    );
    expect(setter.calls.map((call) => call.control)).toEqual(['brightness', 'power', 'power']);
    expect(result.sent).toEqual(['lamp']);
    expect(result.skipped).toMatchObject([{ deviceId: 'gone', reason: 'unsupported' }]);
  });

  it('fails when nothing could be restored', async () => {
    const setter = recordingSetter(() => true);
    await expect(
      new DeviceRestorer(setter).restore({ lamp: { power: true } }, STAMP, testRun()),
    ).rejects.toMatchObject({ code: 'command_refused' });
  });
});

describe('scene capture', () => {
  const lamp = '6f1d2c34-5b7a-4e8f-9a01-b2c3d4e5f607';
  const actions = actionsOfSnapshot({ [lamp]: { power: true, brightness: 40 } });

  it('turns a snapshot into command actions', () => {
    expect(actions).toEqual([
      { type: 'command', deviceId: lamp, capability: 'power', value: true },
      { type: 'command', deviceId: lamp, capability: 'brightness', value: 40 },
    ]);
  });

  it('saves a new scene, refuses a taken name and replaces it when allowed', async () => {
    const home = await setup();
    const { store } = home.db;
    const made = captureScene(store, { name: 'Rain', overwrite: false, actions });
    expect(store.scenes.byId(made.id).actions).toEqual(actions);
    expect(() => captureScene(store, { name: 'Rain', overwrite: false, actions })).toThrow(
      /already exists/,
    );
    const again = captureScene(store, {
      name: 'Rain',
      overwrite: true,
      actions: actions.slice(0, 1),
    });
    expect(again.id).toBe(made.id);
    expect(store.scenes.byId(made.id).actions).toHaveLength(1);
  });

  it('refuses an empty capture', async () => {
    const home = await setup();
    expect(() =>
      captureScene(home.db.store, { name: 'Empty', overwrite: false, actions: [] }),
    ).toThrow(/nothing to save/);
  });
});
