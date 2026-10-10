import type { HubCommand, JsonValue } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommandExecutor, describeError } from '../src/commands/executor';
import { DeviceDriverRegistry } from '../src/local/device-driver';
import { Inventory } from '../src/state/inventory';
import { FakeDatabase } from './support/fake-database';
import { FakeAdapter, LAMP } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

const NOW = new Date('2026-10-08T12:00:00.000Z');

interface Setup {
  db: FakeDatabase;
  adapter: FakeAdapter;
  executor: CommandExecutor;
  lampId: string;
  hubCommands: HubCommand[];
  running: { value: boolean };
}

async function setup(
  hubReply: () => Promise<JsonValue> = () => Promise.resolve({ ok: true }),
): Promise<Setup> {
  const db = new FakeDatabase();
  const inventory = new Inventory(db, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
  });
  await inventory.apply('xiaomi', [LAMP]);
  const adapter = new FakeAdapter();
  const running = { value: true };
  const hubCommands: HubCommand[] = [];
  const executor = new CommandExecutor({
    store: db,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): FakeAdapter | undefined => (running.value ? adapter : undefined) },
    hubCommand: (command): Promise<JsonValue> => {
      hubCommands.push(command);
      return hubReply();
    },
    log: testLogger(),
    now: (): Date => NOW,
  });
  return {
    db,
    adapter,
    executor,
    lampId: inventory.deviceOf('xiaomi', 'lamp-1')?.id ?? '',
    hubCommands,
    running,
  };
}

beforeEach(() => {
  captureLogs();
});

describe('CommandExecutor', () => {
  it('validates a device command, runs it on the adapter and records success with the result', async () => {
    const { db, adapter, executor, lampId } = await setup();
    adapter.result = { applied: true };
    const command = db.addCommand({ device_id: lampId, capability: 'brightness', value: 40 });
    await executor.run(command);
    expect(adapter.executed).toStrictEqual([
      { commandId: command.id, externalId: 'lamp-1', capability: 'brightness', value: 40 },
    ]);
    expect(db.commands.get(command.id)).toMatchObject({
      status: 'succeeded',
      result: { applied: true },
      error: null,
    });
  });

  it('fails a command the device cannot accept with the named reason, without touching the device', async () => {
    const { db, adapter, executor, lampId } = await setup();
    const tooBright = db.addCommand({ device_id: lampId, capability: 'brightness', value: 400 });
    const readOnly = db.addCommand({ device_id: lampId, capability: 'temperature', value: 20 });
    const missing = db.addCommand({
      device_id: lampId,
      capability: 'color',
      value: { hue: 1, saturation: 1, value: 1 },
    });
    await executor.run(tooBright);
    await executor.run(readOnly);
    await executor.run(missing);
    expect(adapter.executed).toStrictEqual([]);
    expect(db.commands.get(tooBright.id)?.error).toBe(
      'InvalidValueError: Expected a number value: outside 1 to 100. Received 400.',
    );
    expect(db.commands.get(readOnly.id)?.error).toBe(
      'CommandRefusedError: The command for temperature was refused: it can only be read.',
    );
    expect(db.commands.get(missing.id)?.error).toBe(
      'CommandRefusedError: The command for color was refused: the device does not have it.',
    );
  });

  it('fails commands without a device, for an unknown device, or for a provider that is not running', async () => {
    const { db, executor, running, lampId } = await setup();
    const noDevice = db.addCommand({ capability: 'power', value: true });
    const unknown = db.addCommand({
      device_id: '0f000000-0000-4000-8000-000000000000',
      capability: 'power',
      value: true,
    });
    await executor.run(noDevice);
    await executor.run(unknown);
    running.value = false;
    const stopped = db.addCommand({ device_id: lampId, capability: 'power', value: true });
    await executor.run(stopped);
    expect(db.commands.get(noDevice.id)?.error).toBe(
      `CommandTargetError: Command ${noDevice.id} cannot run: the device capability power names no device.`,
    );
    expect(db.commands.get(unknown.id)?.error).toBe(
      `CommandTargetError: Command ${unknown.id} cannot run: device 0f000000-0000-4000-8000-000000000000 is not known to this hub.`,
    );
    expect(db.commands.get(stopped.id)?.error).toBe(
      'ProviderNotRunningError: The xiaomi provider is not linked or not running on this hub.',
    );
  });

  it('records the adapter failure by name', async () => {
    const { db, adapter, executor, lampId } = await setup();
    adapter.failure = new TypeError('socket closed');
    const command = db.addCommand({ device_id: lampId, capability: 'power', value: true });
    await executor.run(command);
    expect(db.commands.get(command.id)).toMatchObject({
      status: 'failed',
      error: 'TypeError: socket closed',
    });
  });

  it('routes hub commands to the hub handler after validating them', async () => {
    const { db, executor, hubCommands } = await setup();
    const discover = db.addCommand({ capability: 'hub:discover', value: { provider: null } });
    const malformed = db.addCommand({ capability: 'hub:discover', value: {} });
    await executor.run(discover);
    await executor.run(malformed);
    expect(hubCommands).toStrictEqual([{ capability: 'hub:discover', value: { provider: null } }]);
    expect(db.commands.get(discover.id)).toMatchObject({
      status: 'succeeded',
      result: { ok: true },
    });
    expect(db.commands.get(malformed.id)?.status).toBe('failed');
  });

  it('marks expired commands expired without running them', async () => {
    const { db, adapter, executor, lampId } = await setup();
    const command = db.addCommand({
      device_id: lampId,
      capability: 'power',
      value: true,
      expires_at: NOW.toISOString(),
    });
    await executor.run(command);
    expect(db.commands.get(command.id)?.status).toBe('expired');
    expect(adapter.executed).toStrictEqual([]);
  });

  it('catches up on pending and interrupted commands, running each exactly once', async () => {
    const { db, adapter, executor, lampId } = await setup();
    const pending = db.addCommand({ device_id: lampId, capability: 'power', value: true });
    const interrupted = db.addCommand({
      device_id: lampId,
      capability: 'power',
      value: false,
      status: 'running',
    });
    db.addCommand({ device_id: lampId, capability: 'power', value: true, status: 'succeeded' });
    expect(await executor.catchUp()).toBe(2);
    void executor.run(pending);
    await executor.settled();
    await executor.run(pending);
    expect(adapter.executed.map((command) => command.commandId)).toStrictEqual([
      pending.id,
      interrupted.id,
    ]);
  });

  it('runs a command only once when the API and the catch-up deliver it together', async () => {
    const { db, adapter, executor, lampId } = await setup();
    const command = db.addCommand({ device_id: lampId, capability: 'power', value: true });
    void executor.run(command);
    void executor.run(command);
    await executor.catchUp();
    await executor.settled();
    expect(adapter.executed).toHaveLength(1);
  });

  it('logs a command whose outcome could not be stored', async () => {
    const logs = captureLogs();
    const { db, executor, lampId } = await setup();
    db.failNext = 'finishCommand';
    await executor.run(db.addCommand({ device_id: lampId, capability: 'power', value: true }));
    expect(logs.events()).toContain('command.not_recorded');
  });

  it('describes anything thrown', () => {
    expect(describeError(new RangeError('x'))).toBe('RangeError: x');
    expect(describeError('plain')).toBe('plain');
  });
});
