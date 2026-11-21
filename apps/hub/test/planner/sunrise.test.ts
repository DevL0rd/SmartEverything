import type { DeviceCapability, DeviceRow, PlannerAlarmRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { SunriseRamp, levelAt, rampSpacingMs, rampStartAt } from '../../src/planner/sunrise';
import { captureLogs, testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const START = '2026-11-07T06:00:00.000Z';
const RING = new Date('2026-11-07T08:00:00.000Z');

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const BRIGHTNESS: DeviceCapability = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 1, max: 100, step: 1, unit: '%' },
};

const WARMTH: DeviceCapability = {
  key: 'color_temperature',
  label: 'Colour temperature',
  access: 'read_write',
  value: { kind: 'number', min: 2000, max: 6500, step: 100, unit: 'K' },
};

interface Sent {
  readonly deviceId: string | null;
  readonly capability: string;
  readonly value: unknown;
}

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let sent: Sent[][];
let ramp: SunriseRamp;
let lamp: DeviceRow;

function light(externalId: string, capabilities: readonly DeviceCapability[]): DeviceRow {
  const [row] = test.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId,
      parentId: null,
      kind: 'light',
      name: externalId,
      model: 'model.one',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities,
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The light was not stored.');
  return row;
}

function alarmWith(lights: readonly string[], minutes: number, colour: boolean): PlannerAlarmRow {
  return test.store.plannerAlarms.insert({
    profile_id: owner.profileId,
    label: null,
    time: '08:00',
    days: [],
    once_on: '2026-11-07',
    skip_on: null,
    enabled: true,
    sound: { kind: 'tone', id: 'default' },
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    snooze_limit: null,
    challenge: { kind: 'none' },
    sunrise: { lights, minutes, colour },
    smart_minutes: null,
    wake_automation_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
  });
}

function valuesOf(capability: string): unknown[] {
  return sent
    .flat()
    .filter((command) => command.capability === capability)
    .map((c) => c.value);
}

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  owner = addPerson(test, 'Owner', 'owner');
  lamp = light('lamp-1', [POWER, BRIGHTNESS, WARMTH]);
  sent = [];
  ramp = new SunriseRamp({
    store: test.store,
    clock,
    submit: (commands): Promise<never[]> => {
      sent.push(
        commands.map((command) => ({
          deviceId: command.deviceId,
          capability: command.capability,
          value: command.value,
        })),
      );
      return Promise.resolve([]);
    },
    log: testLogger('sunrise'),
  });
});

afterEach(async () => {
  ramp.cancelAll();
  await test.close();
});

describe('the sunrise ramp timing', () => {
  it('starts the given minutes before the ring and spaces the steps over them', () => {
    expect(rampStartAt({ lights: [lamp.id], minutes: 30, colour: false }, RING).toISOString()).toBe(
      '2026-11-07T07:30:00.000Z',
    );
    expect(rampSpacingMs(99)).toBe(60_000);
    expect(levelAt(0)).toBe(1);
    expect(levelAt(99)).toBe(100);
  });
});

describe('the sunrise ramp', () => {
  it('arms one timer for the first step and a new one after each step', () => {
    ramp.arm(alarmWith([lamp.id], 99, false), RING);
    expect(clock.pending()).toEqual(['2026-11-07T06:21:00.000Z']);
  });

  it('turns the light on at the lowest brightness and reaches full at the ring time', async () => {
    ramp.arm(alarmWith([lamp.id], 99, false), RING);
    clock.advanceTo('2026-11-07T06:21:00.000Z');
    await ramp.settled();
    clock.advanceTo(RING.toISOString());
    await ramp.settled();
    const levels = valuesOf('brightness');
    expect(levels).toHaveLength(100);
    expect(levels[0]).toBe(1);
    expect(levels.at(-1)).toBe(100);
    expect(levels).toEqual([...levels].sort((left, right) => Number(left) - Number(right)));
    expect(valuesOf('power')).toEqual([true]);
    expect(valuesOf('color_temperature')).toEqual([]);
  });

  it('cools the colour temperature along the way when colour is on', async () => {
    ramp.arm(alarmWith([lamp.id], 99, true), RING);
    clock.advanceTo(RING.toISOString());
    await ramp.settled();
    const warmth = valuesOf('color_temperature');
    expect(warmth).toHaveLength(100);
    expect(warmth[0]).toBe(2000);
    expect(warmth.at(-1)).toBe(6500);
  });

  it('ignores a light without a colour temperature control when colour is on', async () => {
    const plain = light('lamp-2', [POWER, BRIGHTNESS]);
    ramp.arm(alarmWith([plain.id], 99, true), RING);
    clock.advanceTo(RING.toISOString());
    await ramp.settled();
    expect(valuesOf('brightness')).toHaveLength(100);
    expect(valuesOf('color_temperature')).toEqual([]);
  });

  it('only switches a light that cannot dim on and leaves it on', async () => {
    const plain = light('lamp-3', [POWER]);
    ramp.arm(alarmWith([plain.id], 99, false), RING);
    clock.advanceTo(RING.toISOString());
    await ramp.settled();
    expect(sent).toHaveLength(1);
    expect(valuesOf('power')).toEqual([true]);
  });

  it('drives every chosen light on each step', async () => {
    const second = light('lamp-4', [POWER, BRIGHTNESS]);
    ramp.arm(alarmWith([lamp.id, second.id], 99, false), RING);
    clock.advanceTo('2026-11-07T06:21:00.000Z');
    await ramp.settled();
    expect(new Set(sent.flat().map((command) => command.deviceId))).toEqual(
      new Set([lamp.id, second.id]),
    );
  });

  it('stops the remaining steps when it is cancelled', async () => {
    const alarm = alarmWith([lamp.id], 30, false);
    ramp.arm(alarm, RING);
    clock.advanceTo('2026-11-07T07:45:00.000Z');
    await ramp.settled();
    const done = valuesOf('brightness').length;
    ramp.cancel(alarm.id);
    clock.advanceTo(RING.toISOString());
    await ramp.settled();
    expect(valuesOf('brightness')).toHaveLength(done);
    expect(clock.pending()).toEqual([]);
  });

  it('arms the same ring once and does not repeat a step', () => {
    const alarm = alarmWith([lamp.id], 30, false);
    ramp.arm(alarm, RING);
    ramp.arm(alarm, RING);
    ramp.arm(alarm, RING);
    expect(clock.pending()).toHaveLength(1);
  });

  it('joins a ramp already under way at the step that belongs to now', async () => {
    clock.jumpTo('2026-11-07T07:45:00.000Z');
    ramp.arm(alarmWith([lamp.id], 30, false), RING);
    clock.advanceTo(RING.toISOString());
    await ramp.settled();
    const levels = valuesOf('brightness');
    expect(levels[0]).toBeGreaterThan(40);
    expect(levels.at(-1)).toBe(100);
    expect(valuesOf('power')).toEqual([]);
  });

  it('does nothing for a ring in the past or an alarm without a sunrise', () => {
    clock.jumpTo('2026-11-07T09:00:00.000Z');
    ramp.arm(alarmWith([lamp.id], 30, false), RING);
    expect(clock.pending()).toEqual([]);
    const plain = { ...alarmWith([lamp.id], 30, false), sunrise: null };
    ramp.arm(plain, new Date('2026-11-07T10:00:00.000Z'));
    expect(clock.pending()).toEqual([]);
  });

  it('logs a light that is gone and keeps ramping the others', async () => {
    const logs = captureLogs();
    const quiet = new SunriseRamp({
      store: test.store,
      clock,
      submit: (): Promise<never[]> => Promise.resolve([]),
      log: testLogger('sunrise'),
    });
    quiet.arm(alarmWith(['0e000000-0000-4000-8000-000000000009'], 10, false), RING);
    clock.advanceTo('2026-11-07T07:50:00.000Z');
    await quiet.settled();
    expect(logs.events()).toContain('planner.sunrise_light_missing');
    quiet.cancelAll();
  });
});
