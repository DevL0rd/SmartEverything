import {
  DEVICE_CAPABILITY,
  type DiscoveredDevice,
  type JsonValue,
  type SignalInput,
  type TelevisionSettingsRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandExecutor } from '../src/commands/executor';
import { TelevisionRouting } from '../src/commands/television-routing';
import { NO_WAKE_ADDRESS, TelevisionWake } from '../src/commands/television-wake';
import type { SignalListener } from '../src/signals/bus';
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

function onlineSignal(subject: string): SignalInput {
  return {
    source: 'device',
    kind: 'online',
    subject,
    field: null,
    value: true,
    previous: null,
    at: NOW.toISOString(),
    profileId: null,
    data: {},
  };
}

let db: TestDatabase;
let smartthings: FakeAdapter;
let executor: CommandExecutor;
let deviceId: string;
let inventory: Inventory;
let woken: string[];
let listeners: Set<SignalListener>;

beforeEach(async () => {
  captureLogs();
  db = await testDatabase(NOW);
  woken = [];
  listeners = new Set();
  inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
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
      settingsOf: (id): TelevisionSettingsRow | undefined => db.store.televisionSettings.find(id),
      wake: new TelevisionWake({
        wake: (mac): Promise<void> => {
          woken.push(mac);
          return Promise.resolve();
        },
        settingsOf: (id): TelevisionSettingsRow | undefined => db.store.televisionSettings.find(id),
        woke: (id): void => {
          db.store.televisionSettings.recordWakeWorked(id, NOW.toISOString());
        },
        online: (id): boolean => inventory.deviceById(id)?.online === true,
        subscribe: (listener): (() => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        clock: {
          now: (): Date => NOW,
          at: (): (() => void) => () => undefined,
          sleep: (): Promise<void> => Promise.resolve(),
        },
        log: testLogger('television'),
      }),
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

  it('wakes an offline screen over the network and turns it on once it is back online', async () => {
    await inventory.setOnline('smartthings', 'st-tv', false);
    db.store.televisionSettings.setWakeAddress(deviceId, 'a1:b2:c3:d4:e5:f6');
    const command = add('power', true);
    const running = executor.run(command);
    await vi.waitFor(() => {
      expect(woken).toStrictEqual(['a1:b2:c3:d4:e5:f6']);
    });
    expect(smartthings.executed).toStrictEqual([]);
    await inventory.setOnline('smartthings', 'st-tv', true);
    for (const listener of listeners) {
      listener(onlineSignal(deviceId));
    }
    await running;
    expect(smartthings.executed).toStrictEqual([
      { commandId: command.id, externalId: 'st-tv', capability: 'power', value: true },
    ]);
    expect(db.store.commands.byId(command.id).status).toBe('succeeded');
    expect(db.store.televisionSettings.find(deviceId)?.wake_worked_at).toBe(NOW.toISOString());
  });

  it('refuses to turn on an offline screen that has no wake address, saying what to do', async () => {
    await inventory.setOnline('smartthings', 'st-tv', false);
    const command = add('power', true);
    await executor.run(command);
    expect(woken).toStrictEqual([]);
    expect(smartthings.executed).toStrictEqual([]);
    expect(db.store.commands.byId(command.id)).toMatchObject({
      status: 'failed',
      error: `CommandRefusedError: The command for power was refused: ${NO_WAKE_ADDRESS}.`,
    });
  });
});
