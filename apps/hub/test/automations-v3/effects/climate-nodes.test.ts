import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  DeviceCapability,
  DeviceCommand,
  DiscoveredDevice,
  JsonValue,
  RoomRow,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { climateEffects } from '../../../src/automations/effects/climate-nodes';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { FakeAdapter, LAMP } from '../../support/fake-provider';
import { testLogger } from '../../support/logs';
import { testRun } from './support';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

class TogetherAdapter extends FakeAdapter {
  readonly together: DeviceCommand[][] = [];
  gate: Promise<void> | null = null;

  executeTogether = async (commands: readonly DeviceCommand[]): Promise<JsonValue> => {
    this.together.push([...commands]);
    if (this.gate !== null) await this.gate;
    return null;
  };

  close(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }
}

function batches(adapter: TogetherAdapter): readonly (readonly DeviceCommand[])[] {
  return [...adapter.together, ...adapter.executed.map((command) => [command])];
}

function capability(
  key: DeviceCapability['key'],
  value: DeviceCapability['value'],
  access: DeviceCapability['access'] = 'read_write',
): DeviceCapability {
  return { key, label: key, access, value };
}

const POWER = capability('power', { kind: 'boolean' });
const MODE = capability('hvac_mode', { kind: 'enum', options: ['cool', 'heat', 'auto'] });
const FAN_MODE = capability('fan_mode', { kind: 'enum', options: ['low', 'high', 'auto'] });
const SWING = capability('swing', { kind: 'enum', options: ['off', 'vertical'] });
const celsius = (min: number, max: number): DeviceCapability =>
  capability('target_temperature', { kind: 'number', min, max, step: 0.5, unit: 'celsius' });
const fahrenheit = (min: number, max: number): DeviceCapability =>
  capability('target_temperature', { kind: 'number', min, max, step: 1, unit: 'fahrenheit' });
const timer = (unit?: string): DeviceCapability =>
  capability('off_timer', {
    kind: 'number',
    min: 0,
    max: 720,
    step: 1,
    ...(unit === undefined ? {} : { unit }),
  });

function climateDevice(
  name: string,
  kind: DiscoveredDevice['kind'],
  capabilities: readonly DeviceCapability[],
  room: string | null = 'Study',
): DiscoveredDevice {
  return { ...LAMP, externalId: name, name, kind, room, capabilities: [...capabilities] };
}

const COOLER_A = climateDevice('Cooler A', 'air_conditioner', [
  POWER,
  MODE,
  celsius(16, 30),
  FAN_MODE,
  SWING,
  timer('minutes'),
]);
const COOLER_B = climateDevice('Cooler B', 'air_conditioner', [
  POWER,
  MODE,
  celsius(16, 30),
  FAN_MODE,
  SWING,
  timer('minutes'),
]);
const COOLER_F = climateDevice('Cooler F', 'air_conditioner', [
  POWER,
  MODE,
  fahrenheit(61, 75),
  timer('hours'),
]);
const TOWER_FAN: DiscoveredDevice = {
  ...climateDevice('Tower fan', 'fan', [
    POWER,
    capability('raw:2.3', {
      kind: 'enum',
      options: ['Straight Wind', 'Natural Wind', 'Sleep'],
    }),
    capability('raw:2.6', { kind: 'boolean' }),
    capability('fan_speed', { kind: 'number', min: 1, max: 100, step: 1 }),
  ]),
  model: 'xiaomi.fan.p45',
};
const NO_UNIT = climateDevice('Old cooler', 'air_conditioner', [
  POWER,
  capability('target_temperature', { kind: 'number', min: 16, max: 30, step: 1 }),
  timer(),
]);
const READ_ONLY = climateDevice('Sensor unit', 'thermostat', [
  capability(
    'target_temperature',
    { kind: 'number', min: 5, max: 30, step: 1, unit: 'celsius' },
    'read',
  ),
]);

interface Rig {
  readonly db: TestDatabase;
  readonly room: RoomRow;
  readonly adapter: TogetherAdapter;
  readonly clock: FakeClock;
  readonly ids: Readonly<Record<string, string>>;
  readonly perform: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

function request(params: EffectRequest['params'], mode?: EffectRequest['mode']): EffectRequest {
  return {
    kind: 'climate.set',
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'idempotent',
    budget: 'command',
    ...(mode === undefined ? {} : { mode }),
  };
}

async function home(devices: readonly DiscoveredDevice[]): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const room = db.store.rooms.create('Study', 0);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('xiaomi', [...devices]);
  const ids = Object.fromEntries(
    devices.map((device) => [
      device.name,
      inventory.deviceOf('xiaomi', device.externalId)?.id ?? '',
    ]),
  );
  const adapter = new TogetherAdapter();
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): TogetherAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const setter = new DeviceSetter({ store: db.store, executor, issuer });
  const handler = climateEffects({ store: db.store, setter })['climate.set'];
  const perform: Rig['perform'] = (params, mode) => {
    if (handler === undefined) throw new Error('climate.set has no handler');
    return handler(params, request(params, mode), testRun());
  };
  return { db, room, adapter, clock, ids, perform };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
}

function report(db: TestDatabase, deviceId: string, capabilityKey: string, value: JsonValue): void {
  db.store.state.write([
    {
      deviceId,
      capability: capabilityKey,
      value,
      observedAt: new Date(NOW.getTime() + 100).toISOString(),
    },
  ]);
}

const OUTCOME = z.object({
  sent: z.array(z.object({ device: z.string() })),
  skipped: z.array(z.object({ device: z.object({ device: z.string() }), reason: z.string() })),
});

function outcomeOf(result: NodeResult): z.infer<typeof OUTCOME> {
  if (!result.ok) throw new Error(`the node failed: ${result.message}`);
  return OUTCOME.parse(result.value);
}

function sentTo(result: NodeResult): readonly string[] {
  return outcomeOf(result).sent.map((entry) => entry.device);
}

function skippedReasons(result: NodeResult): readonly string[] {
  return outcomeOf(result).skipped.map((entry) => entry.reason);
}

function valuesOf(commands: readonly DeviceCommand[]): Record<string, JsonValue> {
  return Object.fromEntries(commands.map((command) => [command.capability, command.value]));
}

describe('climate.set sends every device at once, one multi-control command each', () => {
  it('puts all controls of a device in one together call and starts every device before any finishes', async () => {
    const rig = await home([COOLER_A, COOLER_B]);
    const release = rig.adapter.close();
    const result = rig.perform({
      target: { devices: [rig.ids['Cooler A'] ?? '', rig.ids['Cooler B'] ?? ''] },
      power: 'on',
      mode: 'cool',
      temperature: 22,
      fan: 'high',
      swing: 'vertical',
      offTimer: 1_800_000,
    });
    await settle();
    expect(batches(rig.adapter)).toHaveLength(2);
    expect(rig.adapter.executed).toStrictEqual([]);
    for (const commands of batches(rig.adapter)) {
      expect(valuesOf(commands)).toStrictEqual({
        power: true,
        hvac_mode: 'cool',
        target_temperature: 22,
        fan_mode: 'high',
        swing: 'vertical',
        off_timer: 30,
      });
    }
    release();
    const done = await result;
    expect(done).toMatchObject({ ok: true });
    expect(sentTo(done)).toHaveLength(2);
    expect(skippedReasons(done)).toStrictEqual([]);
  });

  it('sends a whole room at once and gives each device only the settings it has', async () => {
    const rig = await home([COOLER_A, TOWER_FAN]);
    const release = rig.adapter.close();
    const result = rig.perform({
      target: { room: rig.room.id },
      power: 'on',
      temperature: 21,
      oscillation: true,
      fanSpeed: 3,
    });
    await settle();
    expect(batches(rig.adapter)).toHaveLength(2);
    const byCapabilities = batches(rig.adapter).map(valuesOf);
    expect(byCapabilities).toContainEqual({ power: true, target_temperature: 21 });
    expect(byCapabilities).toContainEqual({ power: true, 'raw:2.6': true, fan_speed: 3 });
    release();
    expect(await result).toMatchObject({ ok: true });
  });

  it('drives the mode role of a tower fan when it has no hvac mode, and its oscillation by role', async () => {
    const rig = await home([TOWER_FAN]);
    const result = await rig.perform({
      target: { device: rig.ids['Tower fan'] ?? '' },
      mode: 'Natural Wind',
    });
    expect(result).toMatchObject({ ok: true });
    expect(batches(rig.adapter).map(valuesOf)).toStrictEqual([{ 'raw:2.3': 'Natural Wind' }]);
  });

  it('continues once the commands are handed over without waiting for a state report', async () => {
    const rig = await home([COOLER_A]);
    const result = await rig.perform({
      target: { device: rig.ids['Cooler A'] ?? '' },
      power: 'off',
    });
    expect(result).toMatchObject({ ok: true });
    expect(batches(rig.adapter)).toHaveLength(1);
  });
});

describe('climate.set converts the temperature to what each device uses', () => {
  it('sends Celsius as it is to a Celsius device and converts to Fahrenheit for a Fahrenheit device', async () => {
    const rig = await home([COOLER_A, COOLER_F]);
    const result = await rig.perform({
      target: { devices: [rig.ids['Cooler A'] ?? '', rig.ids['Cooler F'] ?? ''] },
      temperature: 22,
      unit: 'c',
    });
    expect(result).toMatchObject({ ok: true });
    const temperatures = batches(rig.adapter).map(
      (commands) => valuesOf(commands)['target_temperature'],
    );
    expect(temperatures.toSorted()).toStrictEqual([22, 72]);
  });

  it('converts a Fahrenheit ask to Celsius and snaps it to the device step', async () => {
    const rig = await home([COOLER_A]);
    const result = await rig.perform({
      target: { device: rig.ids['Cooler A'] ?? '' },
      temperature: 72,
      unit: 'f',
    });
    expect(result).toMatchObject({ ok: true });
    expect(valuesOf(batches(rig.adapter)[0] ?? [])).toStrictEqual({ target_temperature: 22 });
  });

  it('skips a device that does not say its unit when the ask is Fahrenheit, and sends Celsius as given', async () => {
    const rig = await home([NO_UNIT, COOLER_A]);
    const ids = [rig.ids['Old cooler'] ?? '', rig.ids['Cooler A'] ?? ''];
    const refused = await rig.perform({
      target: { devices: [ids[0] ?? ''] },
      temperature: 70,
      unit: 'f',
    });
    expect(refused).toMatchObject({ ok: false, class: 'Refused' });
    const result = await rig.perform({ target: { devices: ids }, temperature: 20, unit: 'c' });
    expect(sentTo(result)).toHaveLength(2);
  });

  it('skips a device whose range the temperature is outside of, without clamping, and sends the others', async () => {
    const rig = await home([COOLER_A, COOLER_F]);
    const devices = [rig.ids['Cooler A'] ?? '', rig.ids['Cooler F'] ?? ''];
    const mixed = await rig.perform({ target: { devices }, temperature: 28, unit: 'c' });
    expect(sentTo(mixed)).toStrictEqual([rig.ids['Cooler A']]);
    expect(skippedReasons(mixed)).toHaveLength(1);
    expect(skippedReasons(mixed)[0]).toContain('outside what');
    expect(valuesOf(batches(rig.adapter)[0] ?? [])).toStrictEqual({ target_temperature: 28 });
    const none = await rig.perform({ target: { devices }, temperature: 40, unit: 'c' });
    expect(none).toMatchObject({ ok: false, class: 'Refused' });
    expect(none.ok ? '' : none.message).toContain('outside what');
  });
});

describe('climate.set skips what a device cannot do and says why', () => {
  it('skips a choice the device does not offer and lists what it offers', async () => {
    const rig = await home([COOLER_A, COOLER_F]);
    const result = await rig.perform({
      target: { devices: [rig.ids['Cooler A'] ?? '', rig.ids['Cooler F'] ?? ''] },
      mode: 'heat',
      fan: 'low',
    });
    expect(sentTo(result)).toHaveLength(2);
    const refused = await rig.perform({
      target: { device: rig.ids['Cooler A'] ?? '' },
      mode: 'dry',
    });
    expect(refused).toMatchObject({ ok: false, class: 'Refused' });
    expect(refused.ok ? '' : refused.message).toContain('it offers cool, heat, auto');
  });

  it('skips a device with none of the asked controls and a device whose control is read only', async () => {
    const rig = await home([COOLER_A, READ_ONLY, climateDevice('Lamp', 'light', [POWER], 'Study')]);
    const result = await rig.perform({
      target: { room: rig.room.id },
      temperature: 20,
    });
    expect(sentTo(result)).toStrictEqual([rig.ids['Cooler A']]);
    expect(skippedReasons(result)).toHaveLength(2);
    expect(
      skippedReasons(result).every((reason) => reason.includes('none of the climate settings')),
    ).toBe(true);
  });

  it('converts the off timer to the unit the device counts in and refuses a timer with no unit', async () => {
    const rig = await home([COOLER_A, COOLER_F, NO_UNIT]);
    const result = await rig.perform({
      target: { devices: [rig.ids['Cooler A'] ?? '', rig.ids['Cooler F'] ?? ''] },
      offTimer: 7_200_000,
    });
    expect(sentTo(result)).toHaveLength(2);
    expect(batches(rig.adapter).map(valuesOf)).toStrictEqual([
      { off_timer: 120 },
      { off_timer: 2 },
    ]);
    const refused = await rig.perform({
      target: { device: rig.ids['Old cooler'] ?? '' },
      offTimer: 60_000,
    });
    expect(refused).toMatchObject({ ok: false, class: 'Refused' });
    expect(refused.ok ? '' : refused.message).toContain('does not say which unit it counts in');
  });

  it('is Invalid when nothing is asked and fails for an unknown device', async () => {
    const rig = await home([COOLER_A]);
    expect(await rig.perform({ target: { device: rig.ids['Cooler A'] ?? '' } })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.perform({ target: { device: 'missing' }, power: 'on' })).toMatchObject({
      ok: false,
    });
  });
});

describe('climate.set waits for the devices when the node waits for the result', () => {
  it('finishes when every device reports the values and times out when one does not', async () => {
    const rig = await home([COOLER_A, COOLER_B]);
    const first = rig.ids['Cooler A'] ?? '';
    const second = rig.ids['Cooler B'] ?? '';
    let finished = false;
    const result = rig
      .perform(
        { target: { devices: [first, second] }, power: 'on', temperature: 22 },
        'wait_for_result',
      )
      .finally(() => {
        finished = true;
      });
    await settle();
    report(rig.db, first, 'power', true);
    report(rig.db, first, 'target_temperature', 22);
    await settle();
    expect(finished).toBe(false);
    report(rig.db, second, 'power', true);
    report(rig.db, second, 'target_temperature', 22);
    expect(await result).toMatchObject({ ok: true });

    const stuck = rig.perform({ target: { device: first }, mode: 'heat' }, 'wait_for_result');
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 60_000).toISOString());
    expect(await stuck).toMatchObject({ ok: false, class: 'Timeout' });
  });
});
