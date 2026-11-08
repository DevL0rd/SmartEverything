import type {
  CommandRow,
  DeviceCommand,
  JsonValue,
  ProviderAdapter,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandExecutor } from '../src/commands/executor';
import { DeviceDriverRegistry, type DeviceDriver } from '../src/local/device-driver';
import { Inventory } from '../src/state/inventory';
import { testDatabase, type TestDatabase } from './support/database';
import { LAMP } from './support/fake-provider';
import { testLogger } from './support/logs';
import { NOW } from './support/executor-setup';

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

interface Rig {
  readonly executor: CommandExecutor;
  readonly rows: readonly CommandRow[];
  readonly single: DeviceCommand[];
  readonly together: (readonly DeviceCommand[])[];
  readonly get: (id: string) => CommandRow;
}

async function rig(batching: boolean): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('local', [{ ...LAMP, provider: 'local', externalId: 'wiz:lamp' }]);
  const single: DeviceCommand[] = [];
  const together: (readonly DeviceCommand[])[] = [];
  const driver: DeviceDriver = {
    id: 'wiz',
    start: (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve()),
    execute: (command): Promise<JsonValue> => {
      single.push(command);
      return Promise.resolve({ single: true });
    },
    ...(batching
      ? {
          executeTogether: (commands: readonly DeviceCommand[]): Promise<JsonValue> => {
            together.push(commands);
            return Promise.resolve({ together: commands.length });
          },
        }
      : {}),
  };
  const drivers = new DeviceDriverRegistry();
  drivers.register(driver);
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers,
    adapters: { adapterFor: (): undefined => undefined },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: (): Date => NOW,
  });
  const deviceId = inventory.deviceOf('local', 'wiz:lamp')?.id ?? '';
  db.setNow(NOW);
  const rows = db.store.commands.insert([
    { deviceId, capability: 'brightness', value: 30, source: 'automation', requestedBy: null },
    { deviceId, capability: 'power', value: true, source: 'automation', requestedBy: null },
  ]);
  return { executor, rows, single, together, get: (id) => db.store.commands.byId(id) };
}

describe('CommandExecutor running a device commands together', () => {
  it('hands every command to a driver that takes them together in one call and records each', async () => {
    const home = await rig(true);
    await home.executor.runTogether(home.rows);
    expect(home.together).toHaveLength(1);
    expect(home.together[0]?.map((command) => command.capability)).toEqual(['brightness', 'power']);
    expect(home.single).toEqual([]);
    for (const row of home.rows)
      expect(home.get(row.id)).toMatchObject({ status: 'succeeded', result: { together: 2 } });
  });

  it('runs the commands one after the other, in order, on a driver that cannot batch', async () => {
    const home = await rig(false);
    await home.executor.runTogether(home.rows);
    expect(home.single.map((command) => command.capability)).toEqual(['brightness', 'power']);
    for (const row of home.rows) expect(home.get(row.id).status).toBe('succeeded');
  });

  it('fails every command of the group when the run is no longer authorised', async () => {
    const home = await rig(true);
    await home.executor.runTogether(home.rows, () => {
      throw new Error('run cancelled');
    });
    for (const row of home.rows)
      expect(home.get(row.id)).toMatchObject({ status: 'failed', error: 'Error: run cancelled' });
  });
});

async function adapterRig(batching: boolean): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  await inventory.apply('smartthings', [
    { ...LAMP, provider: 'smartthings', externalId: 'st:lamp' },
  ]);
  const single: DeviceCommand[] = [];
  const together: (readonly DeviceCommand[])[] = [];
  const adapter: ProviderAdapter = {
    provider: 'smartthings',
    discover: (): Promise<[]> => Promise.resolve([]),
    subscribe: (): Promise<() => Promise<void>> => Promise.resolve(() => Promise.resolve()),
    refresh: (): Promise<[]> => Promise.resolve([]),
    execute: (command): Promise<JsonValue> => {
      single.push(command);
      return Promise.resolve({ single: true });
    },
    ...(batching
      ? {
          executeTogether: (commands: readonly DeviceCommand[]): Promise<JsonValue> => {
            together.push(commands);
            return Promise.resolve({ together: commands.length });
          },
        }
      : {}),
  };
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): ProviderAdapter => adapter },
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    log: testLogger(),
    now: (): Date => NOW,
  });
  const deviceId = inventory.deviceOf('smartthings', 'st:lamp')?.id ?? '';
  db.setNow(NOW);
  const rows = db.store.commands.insert([
    { deviceId, capability: 'brightness', value: 30, source: 'automation', requestedBy: null },
    { deviceId, capability: 'power', value: true, source: 'automation', requestedBy: null },
  ]);
  return { executor, rows, single, together, get: (id) => db.store.commands.byId(id) };
}

describe('CommandExecutor running a provider device commands together', () => {
  it('sends two controls of a provider device as one request when the adapter takes them together', async () => {
    const home = await adapterRig(true);
    await home.executor.runTogether(home.rows);
    expect(home.together).toHaveLength(1);
    expect(home.together[0]?.map((command) => command.capability)).toEqual(['brightness', 'power']);
    expect(home.single).toEqual([]);
    for (const row of home.rows)
      expect(home.get(row.id)).toMatchObject({ status: 'succeeded', result: { together: 2 } });
  });

  it('keeps the old path, power last, for an adapter without executeTogether', async () => {
    const home = await adapterRig(false);
    await home.executor.runTogether(home.rows);
    expect(home.single.map((command) => command.capability)).toEqual(['brightness', 'power']);
    for (const row of home.rows) expect(home.get(row.id).status).toBe('succeeded');
  });
});
