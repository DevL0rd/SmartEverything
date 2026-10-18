import { DEVICE_CAPABILITY, type DiscoveredDevice, type JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandExecutor } from '../src/commands/executor';
import { TelevisionRouting } from '../src/commands/television-routing';
import { DeviceDriverRegistry } from '../src/local/device-driver';
import { Inventory } from '../src/state/inventory';
import { testDatabase, type TestDatabase } from './support/database';
import { FakeAdapter } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

const NOW = new Date('2026-10-08T12:00:00.000Z');

const TELEVISION: DiscoveredDevice = {
  provider: 'smartthings',
  externalId: 'st-tv',
  parentExternalId: null,
  kind: 'television',
  name: 'TV',
  model: 'QA65S95BAKXXT',
  manufacturer: 'Samsung',
  room: null,
  online: true,
  capabilities: [
    { key: 'power', access: 'read_write', value: { kind: 'boolean' } },
    { key: 'mute', access: 'read_write', value: { kind: 'boolean' } },
    {
      key: 'remote_key',
      access: 'write',
      value: { kind: 'enum', options: ['up', 'vol_up', 'n3'] },
    },
    { key: 'raw:audio_volume:volume_up', access: 'write', value: { kind: 'action' } },
  ].map((entry) => DEVICE_CAPABILITY.parse({ ...entry, label: entry.key })),
  details: {},
};

let db: TestDatabase;
let smartthings: FakeAdapter;
let executor: CommandExecutor;
let deviceId: string;

beforeEach(async () => {
  captureLogs();
  db = await testDatabase(NOW);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
  });
  await inventory.apply('smartthings', [TELEVISION]);
  deviceId = inventory.deviceOf('smartthings', 'st-tv')?.id ?? '';
  smartthings = new FakeAdapter();
  const adapters = { adapterFor: (): FakeAdapter => smartthings };
  const state = new Map<string, JsonValue>([['power', true]]);
  executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters,
    hubCommand: (): Promise<JsonValue> => Promise.resolve(null),
    television: new TelevisionRouting({
      adapters,
      valueOf: (_device, capability): JsonValue | undefined => state.get(capability),
      attachedTo: (): null => null,
      log: testLogger('television'),
    }),
    log: testLogger(),
    now: (): Date => NOW,
  });
});

afterEach(async () => {
  await db.close();
});

function add(
  capability: string,
  value: JsonValue,
): ReturnType<TestDatabase['store']['commands']['insert']>[number] {
  const [row] = db.store.commands.insert([
    { deviceId, capability, value, source: 'app', requestedBy: null },
  ]);
  if (row === undefined) throw new Error('command not inserted');
  return row;
}

describe('television commands through the executor', () => {
  it('runs the SmartThings action a canonical key stands for', async () => {
    const command = add('remote_key', 'vol_up');
    await executor.run(command);
    expect(smartthings.executed).toStrictEqual([
      {
        commandId: command.id,
        externalId: 'st-tv',
        capability: 'raw:audio_volume:volume_up',
        value: null,
      },
    ]);
    expect(db.store.commands.byId(command.id).status).toBe('succeeded');
  });

  it('records the reason when no path can send the key', async () => {
    const command = add('remote_key', 'n3');
    await executor.run(command);
    expect(smartthings.executed).toStrictEqual([]);
    expect(db.store.commands.byId(command.id)).toMatchObject({
      status: 'failed',
      error:
        'CommandRefusedError: The command for remote_key was refused: Needs a direct connection to the TV.',
    });
  });

  it('leaves other television commands to the SmartThings adapter as before', async () => {
    const command = add('power', false);
    await executor.run(command);
    expect(smartthings.executed).toStrictEqual([
      { commandId: command.id, externalId: 'st-tv', capability: 'power', value: false },
    ]);
  });
});
