import { readFileSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  DEVICE_CAPABILITY,
  type DeviceCapability,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { laundryEffects } from '../../../src/automations/effects/laundry-nodes';
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

const WASHER_CAPABILITIES = z
  .array(DEVICE_CAPABILITY)
  .parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../packages/domain/test/fixtures/mibx5-f29gl-capabilities.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );

const PROGRAM = 'raw:2.3';
const TEMPERATURE = 'raw:2.5';
const SPIN = 'raw:2.7';
const DELAY_MODE = 'raw:2.16';
const DELAY_MINUTES = 'raw:2.17';
const START = 'raw:action.2.2';
const PAUSE = 'raw:action.2.3';
const STOP = 'raw:action.2.1';
const DOOR = 'raw:2.9';
const FAULT = 'raw:2.4';

function washer(
  name: string,
  capabilities: readonly DeviceCapability[] = WASHER_CAPABILITIES,
  online = true,
): DiscoveredDevice {
  return {
    ...LAMP,
    externalId: name,
    name,
    kind: 'appliance',
    model: 'mibx5.washer.f29gl',
    manufacturer: 'Xiaomi',
    online,
    capabilities: [...capabilities],
  };
}

interface Rig {
  readonly db: TestDatabase;
  readonly adapter: FakeAdapter;
  readonly clock: FakeClock;
  readonly ids: Readonly<Record<string, string>>;
  readonly run: (
    kind: 'laundry.start' | 'laundry.control',
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
  readonly report: (deviceId: string, key: string, value: JsonValue) => void;
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

function reporter(db: TestDatabase): Rig['report'] {
  return (deviceId, key, value): void => {
    db.store.state.write([
      {
        deviceId,
        capability: key,
        value,
        observedAt: new Date(NOW.getTime() + 100).toISOString(),
      },
    ]);
  };
}

async function home(devices: readonly DiscoveredDevice[], echo: boolean): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
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
  const report = reporter(db);
  if (echo) {
    const execute = adapter.execute;
    adapter.execute = (command: DeviceCommand): Promise<JsonValue> => {
      const result = execute(command);
      const written = devices
        .find((device) => device.externalId === command.externalId)
        ?.capabilities.find((each) => each.key === command.capability);
      if (written !== undefined && written.value.kind !== 'action')
        report(ids[command.externalId] ?? '', command.capability, command.value);
      return result;
    };
  }
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
  const handlers = laundryEffects({ store: db.store, setter });
  return {
    db,
    adapter,
    clock,
    ids,
    report,
    run: (kind, params, mode): Promise<NodeResult> => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`${kind} has no handler`);
      return handler(params, request(kind, params, mode), testRun());
    },
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await nextTurn();
}

function sent(adapter: FakeAdapter): readonly (readonly [string, JsonValue])[] {
  return adapter.executed.map((command) => [command.capability, command.value]);
}

function ref(rig: Rig, name = 'Washer'): { readonly device: string } {
  return { device: rig.ids[name] ?? '' };
}

describe('laundry.start sends the plan in order', () => {
  it('sets the program, temperature and spin, then presses start', async () => {
    const rig = await home([washer('Washer')], true);
    const result = await rig.run('laundry.start', {
      machine: ref(rig),
      program: 'Cotton',
      temperature: '40',
      spin: '1200',
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.value : {}).toMatchObject({ ok: true, ignored: [] });
    expect(sent(rig.adapter)).toStrictEqual([
      [PROGRAM, 'Cotton'],
      [TEMPERATURE, '40'],
      [SPIN, '1200'],
      [START, null],
    ]);
  });

  it('starts a program with no options by setting only the program', async () => {
    const rig = await home([washer('Washer')], true);
    await rig.run('laundry.start', { machine: ref(rig), program: 'Quick Wash' });
    expect(sent(rig.adapter)).toStrictEqual([
      [PROGRAM, 'Quick Wash'],
      [START, null],
    ]);
  });

  it('sets the delay before the start and counts it as the machine expects', async () => {
    const rig = await home([washer('Washer')], true);
    await rig.run('laundry.start', {
      machine: ref(rig),
      program: 'Cotton',
      delay: 90 * 60_000,
      delayMode: 'Finish Wash',
    });
    expect(sent(rig.adapter)).toStrictEqual([
      [PROGRAM, 'Cotton'],
      [DELAY_MODE, 'Finish Wash'],
      [DELAY_MINUTES, 90],
      [START, null],
    ]);
  });

  it('delays the start by default when the mode is not given', async () => {
    const rig = await home([washer('Washer')], true);
    await rig.run('laundry.start', {
      machine: ref(rig),
      program: 'Cotton',
      delay: 30 * 60_000,
    });
    expect(sent(rig.adapter)).toContainEqual([DELAY_MODE, 'Start Wash']);
  });

  it('leaves out settings the machine already has', async () => {
    const rig = await home([washer('Washer')], true);
    rig.report(rig.ids['Washer'] ?? '', PROGRAM, 'Cotton');
    rig.report(rig.ids['Washer'] ?? '', TEMPERATURE, '40');
    await rig.run('laundry.start', {
      machine: ref(rig),
      program: 'Cotton',
      temperature: '40',
      spin: '1200',
    });
    expect(sent(rig.adapter)).toStrictEqual([
      [SPIN, '1200'],
      [START, null],
    ]);
  });

  it('lists the options the program does not use instead of sending them', async () => {
    const rig = await home([washer('Washer')], true);
    const result = await rig.run('laundry.start', {
      machine: ref(rig),
      program: 'Dry',
      temperature: '40',
      spin: '800',
    });
    expect(result.ok ? result.value : {}).toMatchObject({
      ok: true,
      ignored: ['Temperature', 'Spin speed'],
    });
    expect(sent(rig.adapter)).toStrictEqual([
      [PROGRAM, 'Dry'],
      [START, null],
    ]);
  });
});

describe('laundry.start presses start only after the machine accepted the settings', () => {
  it('waits for each setting to be reported before sending the next', async () => {
    const rig = await home([washer('Washer')], false);
    const id = rig.ids['Washer'] ?? '';
    let finished = false;
    const result = rig
      .run('laundry.start', { machine: ref(rig), program: 'Cotton', temperature: '40' })
      .finally(() => {
        finished = true;
      });
    await settle();
    expect(sent(rig.adapter)).toStrictEqual([[PROGRAM, 'Cotton']]);
    rig.report(id, PROGRAM, 'Cotton');
    await settle();
    expect(sent(rig.adapter)).toStrictEqual([
      [PROGRAM, 'Cotton'],
      [TEMPERATURE, '40'],
    ]);
    expect(finished).toBe(false);
    rig.report(id, TEMPERATURE, '40');
    expect(await result).toMatchObject({ ok: true });
    expect(sent(rig.adapter).at(-1)).toStrictEqual([START, null]);
  });

  it('fails with Timeout and never presses start when a setting is not confirmed', async () => {
    const rig = await home([washer('Washer')], false);
    const result = rig.run('laundry.start', { machine: ref(rig), program: 'Cotton' });
    await settle();
    rig.clock.advanceTo(new Date(NOW.getTime() + 600_000).toISOString());
    expect(await result).toMatchObject({ ok: false, class: 'Timeout' });
    expect(sent(rig.adapter)).toStrictEqual([[PROGRAM, 'Cotton']]);
  });

  it('turns a failure of the machine into a failed result for the error exit', async () => {
    const rig = await home([washer('Washer')], true);
    rig.adapter.failure = new Error('the washer did not answer');
    const result = await rig.run('laundry.start', { machine: ref(rig), program: 'Cotton' });
    expect(result.ok).toBe(false);
  });
});

describe('laundry.start refuses what cannot be done and sends nothing', () => {
  it('refuses a machine that is offline, has its door open or reports a fault', async () => {
    const rig = await home([washer('Washer'), washer('Away', WASHER_CAPABILITIES, false)], true);
    const away = await rig.run('laundry.start', { machine: ref(rig, 'Away'), program: 'Cotton' });
    expect(away).toMatchObject({ ok: false, class: 'Refused' });
    expect(away.ok ? '' : away.message).toContain('offline');
    rig.report(rig.ids['Washer'] ?? '', DOOR, 'Open');
    const door = await rig.run('laundry.start', { machine: ref(rig), program: 'Cotton' });
    expect(door).toMatchObject({ ok: false, class: 'Refused' });
    expect(door.ok ? '' : door.message).toContain('Close the door');
    rig.report(rig.ids['Washer'] ?? '', DOOR, 'Closed And Can Be Opened');
    rig.report(rig.ids['Washer'] ?? '', FAULT, 'Door Lock Malfunction');
    const fault = await rig.run('laundry.start', { machine: ref(rig), program: 'Cotton' });
    expect(fault).toMatchObject({ ok: false, class: 'Refused' });
    expect(fault.ok ? '' : fault.message).toContain('fault');
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('is Invalid for a device that is not a washer, an unknown program or a value off the list', async () => {
    const rig = await home([washer('Washer'), { ...LAMP, externalId: 'Lamp', name: 'Lamp' }], true);
    const lamp = await rig.run('laundry.start', {
      machine: { device: rig.ids['Lamp'] ?? '' },
      program: 'Cotton',
    });
    expect(lamp).toMatchObject({ ok: false, class: 'Invalid' });
    expect(lamp.ok ? '' : lamp.message).toContain('not a washing machine or dryer');
    for (const params of [
      { program: 'Rocket Wash' },
      { program: 'Cotton', temperature: '45' },
      { program: 'Cotton', spin: '1500' },
      { program: 'Cotton', delay: 45_000 },
      { program: 'Cotton', delay: 2881 * 60_000 },
      { program: '' },
    ])
      expect(
        await rig.run('laundry.start', { machine: ref(rig), ...params }),
        JSON.stringify(params),
      ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });

  it('refuses a machine that lacks a control the plan needs', async () => {
    const without = WASHER_CAPABILITIES.filter((each) => each.key !== TEMPERATURE);
    const rig = await home([washer('Washer', without)], true);
    const result = await rig.run('laundry.start', {
      machine: ref(rig),
      program: 'Cotton',
      temperature: '40',
    });
    expect(result).toMatchObject({ ok: false, class: 'Refused' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});

describe('laundry.control pauses and stops the cycle', () => {
  it('presses pause and stop', async () => {
    const rig = await home([washer('Washer')], true);
    expect(await rig.run('laundry.control', { machine: ref(rig), action: 'pause' })).toMatchObject({
      ok: true,
    });
    expect(await rig.run('laundry.control', { machine: ref(rig), action: 'stop' })).toMatchObject({
      ok: true,
    });
    expect(sent(rig.adapter)).toStrictEqual([
      [PAUSE, null],
      [STOP, null],
    ]);
  });

  it('works in both run modes and turns a machine failure into a failed result', async () => {
    const rig = await home([washer('Washer')], true);
    expect(
      await rig.run('laundry.control', { machine: ref(rig), action: 'pause' }, 'wait_for_result'),
    ).toMatchObject({ ok: true });
    rig.adapter.failure = new Error('the washer did not answer');
    expect(
      (await rig.run('laundry.control', { machine: ref(rig), action: 'stop' }, 'wait_for_result'))
        .ok,
    ).toBe(false);
  });

  it('is Refused for a machine without the control and Invalid for a device that is no washer', async () => {
    const without = WASHER_CAPABILITIES.filter((each) => each.key !== PAUSE);
    const rig = await home(
      [washer('Plain', without), { ...LAMP, externalId: 'Lamp', name: 'Lamp' }],
      true,
    );
    expect(
      await rig.run('laundry.control', { machine: ref(rig, 'Plain'), action: 'pause' }),
    ).toMatchObject({ ok: false, class: 'Refused' });
    expect(
      await rig.run('laundry.control', { machine: ref(rig, 'Lamp'), action: 'stop' }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(
      await rig.run('laundry.control', { machine: ref(rig, 'Plain'), action: 'resume' }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.adapter.executed).toStrictEqual([]);
  });
});
