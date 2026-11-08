import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  DeviceCapability,
  DiscoveredDevice,
  JsonValue,
  RoomRow,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applianceEffects } from '../../../src/automations/effects/appliance-nodes';
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

function capability(
  key: DeviceCapability['key'],
  value: DeviceCapability['value'],
  access: DeviceCapability['access'] = 'read_write',
): DeviceCapability {
  return { key, label: key, access, value };
}

const POWER = capability('power', { kind: 'boolean' });
const MODE = capability('purifier_mode', { kind: 'enum', options: ['auto', 'sleep', 'favorite'] });
const CHILD_LOCK = capability('child_lock', { kind: 'boolean' });
const HUMIDITY = capability('target_humidity', {
  kind: 'number',
  min: 30,
  max: 80,
  step: 5,
  unit: '%',
});
const FILTER_RESET = capability('filter_reset', { kind: 'action' }, 'write');
const FILTER_LIFE = capability(
  'filter_life',
  { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
  'read',
);

function appliance(
  name: string,
  kind: DiscoveredDevice['kind'],
  capabilities: readonly DeviceCapability[],
  online = true,
): DiscoveredDevice {
  return { ...LAMP, externalId: name, name, kind, online, capabilities: [...capabilities] };
}

const PURIFIER_A = appliance('Purifier A', 'air_purifier', [
  POWER,
  MODE,
  CHILD_LOCK,
  FILTER_RESET,
  FILTER_LIFE,
]);
const PURIFIER_B = appliance('Purifier B', 'air_purifier', [POWER, MODE, FILTER_RESET]);
const PURIFIER_OFFLINE = appliance(
  'Purifier offline',
  'air_purifier',
  [POWER, MODE, FILTER_RESET],
  false,
);
const HUMIDIFIER = appliance('Humidifier', 'humidifier', [POWER, HUMIDITY]);

interface Rig {
  readonly db: TestDatabase;
  readonly room: RoomRow;
  readonly adapter: FakeAdapter;
  readonly clock: FakeClock;
  readonly ids: Readonly<Record<string, string>>;
  readonly set: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
  readonly action: (
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

function request(
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
): EffectRequest {
  return {
    kind,
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
  const adapter = new FakeAdapter();
  const clock = new FakeClock(NOW.toISOString());
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): FakeAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: clock.now,
  });
  const issuer = new CommandIssuer({ store: db.store, database: db.database, executor, clock });
  const setter = new DeviceSetter({ store: db.store, executor, issuer });
  const handlers = applianceEffects({ store: db.store, setter });
  const performer =
    (kind: string): Rig['set'] =>
    (params, mode) => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`${kind} has no handler`);
      return handler(params, request(kind, params, mode), testRun());
    };
  return {
    db,
    room,
    adapter,
    clock,
    ids,
    set: performer('appliance.set'),
    action: performer('device.action'),
  };
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
  ok: z.literal(true),
  sent: z.array(z.object({ device: z.string() })),
  skipped: z.array(z.object({ device: z.object({ device: z.string() }), reason: z.string() })),
  value: z.json().optional(),
});

function outcomeOf(result: NodeResult): z.infer<typeof OUTCOME> {
  if (!result.ok) throw new Error(`the node failed: ${result.message}`);
  return OUTCOME.parse(result.value);
}

function sentTo(result: NodeResult): readonly string[] {
  return outcomeOf(result)
    .sent.map((entry) => entry.device)
    .toSorted();
}

function sentCommands(adapter: FakeAdapter): readonly (readonly [string, JsonValue])[] {
  return adapter.executed.map((command) => [command.capability, command.value]);
}

describe('appliance.set changes one setting typed by the control', () => {
  it('sets a choice on every device that has it, sends them all at once and reports the value', async () => {
    const rig = await home([PURIFIER_A, PURIFIER_B]);
    const result = await rig.set({
      target: { devices: [rig.ids['Purifier A'] ?? '', rig.ids['Purifier B'] ?? ''] },
      setting: 'purifier_mode',
      value: 'sleep',
    });
    expect(sentTo(result)).toStrictEqual(
      [rig.ids['Purifier A'] ?? '', rig.ids['Purifier B'] ?? ''].toSorted(),
    );
    expect(outcomeOf(result).value).toBe('sleep');
    expect(sentCommands(rig.adapter)).toStrictEqual([
      ['purifier_mode', 'sleep'],
      ['purifier_mode', 'sleep'],
    ]);
  });

  it('sets a switch and a number in the range of the device', async () => {
    const rig = await home([PURIFIER_A, HUMIDIFIER]);
    await rig.set({
      target: { device: rig.ids['Purifier A'] ?? '' },
      setting: 'child_lock',
      value: true,
    });
    await rig.set({
      target: { device: rig.ids['Humidifier'] ?? '' },
      setting: 'target_humidity',
      value: 55,
    });
    expect(sentCommands(rig.adapter)).toStrictEqual([
      ['child_lock', true],
      ['target_humidity', 55],
    ]);
  });

  it('skips a device without the setting or offline and says why, and sends the others', async () => {
    const rig = await home([PURIFIER_A, PURIFIER_B, PURIFIER_OFFLINE]);
    const result = await rig.set({
      target: { room: rig.room.id },
      setting: 'child_lock',
      value: false,
    });
    expect(sentTo(result)).toStrictEqual([rig.ids['Purifier A'] ?? '']);
    const reasons = outcomeOf(result).skipped.map((skip) => skip.reason);
    expect(reasons).toHaveLength(2);
    expect(reasons.toSorted()).toStrictEqual(['Not supported', 'Offline'].toSorted());
  });

  it('refuses a value the control does not take and a value outside its range without clamping', async () => {
    const rig = await home([PURIFIER_A, HUMIDIFIER]);
    const choice = await rig.set({
      target: { device: rig.ids['Purifier A'] ?? '' },
      setting: 'purifier_mode',
      value: 'turbo',
    });
    expect(choice).toMatchObject({ ok: false, class: 'Refused' });
    const range = await rig.set({
      target: { device: rig.ids['Humidifier'] ?? '' },
      setting: 'target_humidity',
      value: 95,
    });
    expect(range).toMatchObject({ ok: false, class: 'Refused' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('picks only settings that can be changed: read only controls and actions are invalid here', async () => {
    const rig = await home([PURIFIER_A]);
    const target = { device: rig.ids['Purifier A'] ?? '' };
    const readOnly = await rig.set({ target, setting: 'filter_life', value: 10 });
    expect(readOnly).toMatchObject({ ok: false, class: 'Invalid' });
    const action = await rig.set({ target, setting: 'filter_reset', value: true });
    expect(action).toMatchObject({ ok: false, class: 'Invalid' });
    expect(action.ok ? '' : action.message).toContain('Run device action');
    const unknown = await rig.set({ target, setting: 'nothing', value: 1 });
    expect(unknown).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('is Invalid without a setting or value', async () => {
    const rig = await home([PURIFIER_A]);
    const target = { device: rig.ids['Purifier A'] ?? '' };
    expect(await rig.set({ target, value: true })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.set({ target, setting: 'child_lock' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });

  it('can require every device to answer', async () => {
    const rig = await home([PURIFIER_A, PURIFIER_B]);
    const result = await rig.set({
      target: { devices: [rig.ids['Purifier A'] ?? '', rig.ids['Purifier B'] ?? ''] },
      setting: 'child_lock',
      value: true,
      requireAll: true,
    });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});

describe('appliance.set run modes', () => {
  it('continues once the command is handed over without waiting for a state report', async () => {
    const rig = await home([PURIFIER_A]);
    const result = await rig.set({
      target: { device: rig.ids['Purifier A'] ?? '' },
      setting: 'purifier_mode',
      value: 'favorite',
    });
    expect(result).toMatchObject({ ok: true });
    expect(rig.adapter.executed).toHaveLength(1);
  });

  it('waits for the device to report the value and times out when it does not', async () => {
    const rig = await home([PURIFIER_A]);
    const id = rig.ids['Purifier A'] ?? '';
    let finished = false;
    const result = rig
      .set({ target: { device: id }, setting: 'purifier_mode', value: 'sleep' }, 'wait_for_result')
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(finished).toBe(false);
    report(rig.db, id, 'purifier_mode', 'sleep');
    expect(await result).toMatchObject({ ok: true });

    const stuck = rig.set(
      { target: { device: id }, setting: 'purifier_mode', value: 'favorite' },
      'wait_for_result',
    );
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 60_000).toISOString());
    expect(await stuck).toMatchObject({ ok: false, class: 'Timeout' });
  });
});

describe('device.action runs an action control with no value', () => {
  it('presses the action on every device that has it and reports ok', async () => {
    const rig = await home([PURIFIER_A, PURIFIER_B, HUMIDIFIER]);
    const result = await rig.action({
      target: { devices: [rig.ids['Purifier A'] ?? '', rig.ids['Purifier B'] ?? ''] },
      action: 'filter_reset',
    });
    expect(outcomeOf(result).ok).toBe(true);
    expect(sentTo(result)).toStrictEqual(
      [rig.ids['Purifier A'] ?? '', rig.ids['Purifier B'] ?? ''].toSorted(),
    );
    expect(sentCommands(rig.adapter)).toStrictEqual([
      ['filter_reset', null],
      ['filter_reset', null],
    ]);
  });

  it('skips devices without the action or offline and reports them', async () => {
    const rig = await home([PURIFIER_A, HUMIDIFIER, PURIFIER_OFFLINE]);
    const result = await rig.action({ target: { room: rig.room.id }, action: 'filter_reset' });
    expect(sentTo(result)).toStrictEqual([rig.ids['Purifier A'] ?? '']);
    expect(
      outcomeOf(result)
        .skipped.map((skip) => skip.reason)
        .toSorted(),
    ).toStrictEqual(['Not supported', 'Offline']);
  });

  it('lists only actions: a setting or read only control is invalid, and so is an unknown name', async () => {
    const rig = await home([PURIFIER_A]);
    const target = { device: rig.ids['Purifier A'] ?? '' };
    const setting = await rig.action({ target, action: 'purifier_mode' });
    expect(setting).toMatchObject({ ok: false, class: 'Invalid' });
    expect(setting.ok ? '' : setting.message).toContain('Change appliance setting');
    expect(await rig.action({ target, action: 'filter_life' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.action({ target, action: 'nothing' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.action({ target })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('fails with Refused and the reason when the only device is offline', async () => {
    const rig = await home([PURIFIER_OFFLINE]);
    const result = await rig.action({
      target: { device: rig.ids['Purifier offline'] ?? '' },
      action: 'filter_reset',
    });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
  });

  it('turns an adapter failure into a failed result for the error exit', async () => {
    const rig = await home([PURIFIER_A]);
    rig.adapter.failure = new Error('the purifier did not answer');
    const result = await rig.action(
      { target: { device: rig.ids['Purifier A'] ?? '' }, action: 'filter_reset' },
      'wait_for_result',
    );
    expect(result.ok).toBe(false);
  });
});
