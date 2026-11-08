import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  CommandRefusedError,
  IR_APPLIANCE_APPLY,
  type DeviceCapability,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { irEffects } from '../../../src/automations/effects/ir-nodes';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { IR_APPLIANCE_DRIVER, applianceExternalId } from '../../../src/infrared/appliance-devices';
import { goalOf } from '../../../src/infrared/appliance-driver';
import { applianceCapabilities } from '../../../src/infrared/appliance-model';
import { DeviceDriverRegistry, type DeviceDriver } from '../../../src/local/device-driver';
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

class DriverRecorder implements DeviceDriver {
  readonly id = IR_APPLIANCE_DRIVER;
  readonly batches: DeviceCommand[][] = [];
  failure: Error | null = null;
  private gate: Promise<void> | null = null;

  hold(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }

  start = (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve());

  execute = (command: DeviceCommand): Promise<JsonValue> => {
    this.batches.push([command]);
    return Promise.resolve(null);
  };

  executeTogether = async (commands: readonly DeviceCommand[]): Promise<JsonValue> => {
    this.batches.push([...commands]);
    if (this.gate !== null) await this.gate;
    if (this.failure !== null) throw this.failure;
    return null;
  };
}

function batches(driver: DriverRecorder): readonly (readonly DeviceCommand[])[] {
  return driver.batches;
}

function valuesOf(commands: readonly DeviceCommand[]): Record<string, JsonValue> {
  return Object.fromEntries(commands.map((command) => [command.capability, command.value]));
}

const BLASTER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'ir-1',
  kind: 'ir_blaster',
  name: 'Living room IR',
  capabilities: [
    {
      key: 'ir_send',
      label: 'Send',
      access: 'write',
      value: { kind: 'action', arguments: ['format', 'code'] },
    },
  ],
};

const APPLIANCE_KEYS = ['Power', 'Temp up', 'Temp down', 'Mode'];

interface Rig {
  readonly db: TestDatabase;
  readonly driver: DriverRecorder;
  readonly clock: FakeClock;
  readonly applianceId: string;
  readonly deviceId: string;
  readonly perform: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

function request(params: EffectRequest['params'], mode?: EffectRequest['mode']): EffectRequest {
  return {
    kind: 'ir.appliance_set',
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

function capabilitiesOf(category: string): DeviceCapability[] {
  return category === 'air conditioner'
    ? applianceCapabilities('air_conditioner', APPLIANCE_KEYS)
    : applianceCapabilities('television', ['Power']);
}

async function home(category = 'air conditioner', published = true): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('xiaomi', [BLASTER]);
  const blasterId = inventory.deviceOf('xiaomi', BLASTER.externalId)?.id ?? '';
  const row = db.store.irAppliances.create({
    blasterId,
    name: 'Study cooler',
    category,
    brand: null,
    encoder: 'learned',
    keys: [],
  });
  const externalId = applianceExternalId(row.id);
  if (published) {
    await inventory.apply('local', [
      {
        ...LAMP,
        provider: 'local',
        externalId,
        kind: category === 'air conditioner' ? 'air_conditioner' : 'television',
        name: row.name,
        room: null,
        capabilities: capabilitiesOf(category),
      },
    ]);
  }
  const driver = new DriverRecorder();
  const drivers = new DeviceDriverRegistry();
  drivers.register(driver);
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers,
    adapters: { adapterFor: (): FakeAdapter => new FakeAdapter() },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const setter = new DeviceSetter({ store: db.store, executor, issuer });
  const handler = irEffects({ store: db.store, clock, setter })['ir.appliance_set'];
  const perform: Rig['perform'] = (params, mode) => {
    if (handler === undefined) throw new Error('ir.appliance_set has no handler');
    return handler(params, request(params, mode), testRun());
  };
  return {
    db,
    driver,
    clock,
    applianceId: row.id,
    deviceId: inventory.deviceOf('local', externalId)?.id ?? '',
    perform,
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
}

describe('ir.appliance_set brings the appliance to one state in one apply', () => {
  it('sends every asked control together and the driver turns them into one apply goal', async () => {
    const rig = await home();
    const result = await rig.perform({
      appliance: rig.applianceId,
      power: 'on',
      mode: 'Cool',
      temperature: 22,
      fan: 3,
    });
    expect(result).toMatchObject({ ok: true, value: { device: { device: rig.deviceId } } });
    expect(batches(rig.driver)).toHaveLength(1);
    const [sent] = batches(rig.driver);
    expect(valuesOf(sent ?? [])).toStrictEqual({
      power: true,
      hvac_mode: 'Cool',
      target_temperature: 22,
      fan_mode: '3',
    });
    expect(goalOf(sent ?? [])).toStrictEqual({ on: true, mode: 'Cool', temp: 22, speed: 3 });
    expect(IR_APPLIANCE_APPLY.safeParse(goalOf(sent ?? [])).success).toBe(true);
  });

  it('sends only what was asked and leaves the rest as it is', async () => {
    const rig = await home();
    const result = await rig.perform({ appliance: rig.applianceId, temperature: 18 });
    expect(result).toMatchObject({ ok: true });
    expect(batches(rig.driver).map(valuesOf)).toStrictEqual([{ target_temperature: 18 }]);
    const off = await rig.perform({ appliance: rig.applianceId, power: 'off' });
    expect(off).toMatchObject({ ok: true });
    expect(batches(rig.driver).map(valuesOf).at(-1)).toStrictEqual({ power: false });
  });

  it('continues once the blaster has been handed the command, without a state report', async () => {
    const rig = await home();
    const result = await rig.perform({
      appliance: rig.applianceId,
      power: 'on',
      temperature: 22,
    });
    expect(result).toMatchObject({ ok: true });
    expect(batches(rig.driver)).toHaveLength(1);
  });

  it('in wait mode continues when the blaster has sent, as an infrared appliance reports no state back', async () => {
    const rig = await home();
    const release = rig.driver.hold();
    let finished = false;
    const result = rig
      .perform({ appliance: rig.applianceId, power: 'on', temperature: 22 }, 'wait_for_result')
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(batches(rig.driver)).toHaveLength(1);
    expect(finished).toBe(false);
    release();
    expect(await result).toMatchObject({ ok: true });
  });
});

describe('ir.appliance_set reports why the blaster could not send', () => {
  it('fails the node with the reason the blaster gave when the apply is refused', async () => {
    const rig = await home();
    rig.driver.failure = new CommandRefusedError('ir_send', 'Study cooler has no IR blaster');
    const result = await rig.perform(
      { appliance: rig.applianceId, power: 'on', temperature: 22 },
      'wait_for_result',
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('no IR blaster');
  });
});

describe('ir.appliance_set refuses what it cannot send and sends nothing', () => {
  it.each([
    ['a temperature below the range', { temperature: 15 }],
    ['a temperature above the range', { temperature: 31 }],
    ['a temperature between steps', { temperature: 22.5 }],
    ['a fan speed past the last step', { fan: 6 }],
    ['a fan speed below the first step', { fan: 0 }],
    ['a mode the appliance does not have', { mode: 'Turbo' }],
    ['nothing to change', {}],
  ])('rejects %s as Invalid', async (_name, ask) => {
    const rig = await home();
    const result = await rig.perform({ appliance: rig.applianceId, ...ask });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(batches(rig.driver)).toHaveLength(0);
  });

  it('says NotFound for an appliance that does not exist', async () => {
    const rig = await home();
    const result = await rig.perform({ appliance: 'missing', power: 'on' });
    expect(result).toMatchObject({ ok: false, class: 'NotFound' });
    expect(batches(rig.driver)).toHaveLength(0);
  });

  it('says NotFound for an appliance that is not shown as a device yet', async () => {
    const rig = await home('air conditioner', false);
    const result = await rig.perform({ appliance: rig.applianceId, power: 'on' });
    expect(result).toMatchObject({ ok: false, class: 'NotFound' });
    expect(batches(rig.driver)).toHaveLength(0);
  });

  it('refuses a setting the appliance has no control for instead of dropping it', async () => {
    const rig = await home('tv');
    const result = await rig.perform({ appliance: rig.applianceId, power: 'on', temperature: 22 });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(batches(rig.driver)).toHaveLength(0);
    const power = await rig.perform({ appliance: rig.applianceId, power: 'on' });
    expect(power).toMatchObject({ ok: true });
    expect(batches(rig.driver).map(valuesOf)).toStrictEqual([{ power: true }]);
  });
});
