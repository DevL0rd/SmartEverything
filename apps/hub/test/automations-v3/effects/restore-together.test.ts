import type { DeviceCommand, DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceRestorer } from '../../../src/automations/effects/device-restore';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { CommandExecutor } from '../../../src/commands/executor';
import { DeviceDriverRegistry } from '../../../src/local/device-driver';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { LAMP } from '../../support/fake-provider';
import { NOW } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { testLogger } from '../../support/logs';
import { testRun } from './support';

const BULBS = 24;
const STAMP = { nodePath: 'node', iteration: 0, attempt: 1 };
const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

function bulb(index: number): DiscoveredDevice {
  return {
    ...LAMP,
    provider: 'local',
    externalId: `wiz:bulb-${String(index)}`,
    name: `Bulb ${String(index)}`,
    capabilities: [
      ...LAMP.capabilities.filter((capability) => capability.key !== 'temperature'),
      {
        key: 'color_temperature',
        label: 'Colour temperature',
        access: 'read_write',
        value: { kind: 'number', min: 2200, max: 6500, step: 1, unit: 'K' },
      },
      {
        key: 'light_effect',
        label: 'Light effect',
        access: 'read_write',
        value: { kind: 'enum', options: ['Cozy', 'Focus'] },
      },
    ],
  };
}

describe('restoring a house of lights', () => {
  it('sends one driver call per light for four controls each, with power last', async () => {
    const db = await testDatabase(NOW);
    open.push(db);
    const inventory = new Inventory(db.database, {
      onlineChanged: (): void => undefined,
      devicesChanged: (): void => undefined,
      lifecycle: (): void => undefined,
    });
    await inventory.apply(
      'local',
      Array.from({ length: BULBS }, (_, index) => bulb(index)),
    );
    const batches: (readonly DeviceCommand[])[] = [];
    const drivers = new DeviceDriverRegistry();
    drivers.register({
      id: 'wiz',
      start: (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve()),
      execute: (): Promise<JsonValue> =>
        Promise.reject(new Error('one control at a time is the slow path')),
      executeTogether: (commands): Promise<JsonValue> => {
        batches.push(commands);
        return Promise.resolve({ success: true });
      },
    });
    const executor = new CommandExecutor({
      store: db.database,
      inventory,
      drivers,
      adapters: { adapterFor: (): undefined => undefined },
      hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
      log: testLogger(),
      now: (): Date => NOW,
    });
    const issuer = new CommandIssuer({
      store: db.store,
      database: db.database,
      executor,
      clock: new FakeClock(NOW.toISOString()),
    });
    const setter = new DeviceSetter({ store: db.store, executor, issuer });
    const calls: string[] = [];
    const counting = {
      setTogether: (
        ...args: Parameters<DeviceSetter['setTogether']>
      ): ReturnType<DeviceSetter['setTogether']> => {
        calls.push(args[0].deviceId);
        return setter.setTogether(...args);
      },
    };
    const snapshot = Object.fromEntries(
      Array.from({ length: BULBS }, (_, index) => [
        inventory.deviceOf('local', `wiz:bulb-${String(index)}`)?.id ?? '',
        { power: true, light_effect: 'Cozy', brightness: 30, color_temperature: 2700 },
      ]),
    );
    const result = await new DeviceRestorer(counting).restore(snapshot, STAMP, testRun());
    expect(result.sent).toHaveLength(BULBS);
    expect(calls).toHaveLength(BULBS);
    expect(batches).toHaveLength(BULBS);
    for (const batch of batches) {
      expect(batch.map((command) => command.capability)).toEqual([
        'light_effect',
        'brightness',
        'color_temperature',
        'power',
      ]);
    }
  });
});
