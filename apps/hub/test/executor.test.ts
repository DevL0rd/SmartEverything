import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOW, closeSetups, setup } from './support/executor-setup';
import { captureLogs } from './support/logs';

afterEach(closeSetups);

beforeEach(() => {
  captureLogs();
});

describe('CommandExecutor', () => {
  it('validates a device command, runs it on the adapter and records success with the result', async () => {
    const { commands, adapter, executor, lampId } = await setup();
    adapter.result = { applied: true };
    const command = commands.add({ device_id: lampId, capability: 'brightness', value: 40 });
    await executor.run(command);
    expect(adapter.executed).toStrictEqual([
      { commandId: command.id, externalId: 'lamp-1', capability: 'brightness', value: 40 },
    ]);
    expect(commands.get(command.id)).toMatchObject({
      status: 'succeeded',
      result: { applied: true },
      error: null,
    });
  });

  it('fails a command the device cannot accept with the named reason, without touching the device', async () => {
    const { commands, adapter, executor, lampId } = await setup();
    const tooBright = commands.add({ device_id: lampId, capability: 'brightness', value: 400 });
    const readOnly = commands.add({ device_id: lampId, capability: 'temperature', value: 20 });
    const missing = commands.add({
      device_id: lampId,
      capability: 'color',
      value: { hue: 1, saturation: 1, value: 1 },
    });
    await executor.run(tooBright);
    await executor.run(readOnly);
    await executor.run(missing);
    expect(adapter.executed).toStrictEqual([]);
    expect(commands.get(tooBright.id).error).toBe(
      'InvalidValueError: Expected a number value: outside 1 to 100. Received 400.',
    );
    expect(commands.get(readOnly.id).error).toBe(
      'CommandRefusedError: The command for temperature was refused: it can only be read.',
    );
    expect(commands.get(missing.id).error).toBe(
      'CommandRefusedError: The command for color was refused: the device does not have it.',
    );
  });

  it('fails commands without a device, for an unknown device, or for a provider that is not running', async () => {
    const { db, commands, executor, running, lampId } = await setup();
    const [ghost] = await db.database.upsertDevices([
      {
        provider: 'xiaomi',
        externalId: 'ghost',
        parentId: null,
        kind: 'light',
        name: 'Ghost',
        model: 'ghost',
        manufacturer: 'ghost',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    const ghostId = ghost?.id ?? '';
    const noDevice = commands.add({ capability: 'power', value: true });
    const unknown = commands.add({
      device_id: ghostId,
      capability: 'power',
      value: true,
    });
    await executor.run(noDevice);
    await executor.run(unknown);
    running.value = false;
    const stopped = commands.add({ device_id: lampId, capability: 'power', value: true });
    await executor.run(stopped);
    expect(commands.get(noDevice.id).error).toBe(
      `CommandTargetError: Command ${noDevice.id} cannot run: the device capability power names no device.`,
    );
    expect(commands.get(unknown.id).error).toBe(
      `CommandTargetError: Command ${unknown.id} cannot run: device ${ghostId} is not known to this hub.`,
    );
    expect(commands.get(stopped.id).error).toBe(
      'ProviderNotRunningError: The xiaomi provider is not linked or not running on this hub.',
    );
  });

  it('records the adapter failure by name', async () => {
    const { commands, adapter, executor, lampId } = await setup();
    adapter.failure = new TypeError('socket closed');
    const command = commands.add({ device_id: lampId, capability: 'power', value: true });
    await executor.run(command);
    expect(commands.get(command.id)).toMatchObject({
      status: 'failed',
      error: 'TypeError: socket closed',
    });
  });

  it('routes hub commands to the hub handler after validating them', async () => {
    const { commands, executor, hubCommands } = await setup();
    const discover = commands.add({ capability: 'hub:discover', value: { provider: null } });
    const malformed = commands.add({ capability: 'hub:discover', value: {} });
    await executor.run(discover);
    await executor.run(malformed);
    expect(hubCommands).toStrictEqual([{ capability: 'hub:discover', value: { provider: null } }]);
    expect(commands.get(discover.id)).toMatchObject({
      status: 'succeeded',
      result: { ok: true },
    });
    expect(commands.get(malformed.id).status).toBe('failed');
  });

  it('marks expired commands expired without running them', async () => {
    const { commands, adapter, executor, lampId } = await setup();
    const command = commands.add({
      device_id: lampId,
      capability: 'power',
      value: true,
      createdAt: new Date(NOW.getTime() - 2 * 60_000),
    });
    await executor.run(command);
    expect(commands.get(command.id).status).toBe('expired');
    expect(adapter.executed).toStrictEqual([]);
  });

  it('catches up on pending and interrupted commands, running each exactly once', async () => {
    const { commands, adapter, executor, lampId } = await setup();
    const pending = commands.add({ device_id: lampId, capability: 'power', value: true });
    const interrupted = commands.add({
      device_id: lampId,
      capability: 'power',
      value: false,
      status: 'running',
    });
    commands.add({ device_id: lampId, capability: 'power', value: true, status: 'succeeded' });
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
    const { commands, adapter, executor, lampId } = await setup();
    const command = commands.add({ device_id: lampId, capability: 'power', value: true });
    void executor.run(command);
    void executor.run(command);
    await executor.catchUp();
    await executor.settled();
    expect(adapter.executed).toHaveLength(1);
  });

  it('logs a command whose outcome could not be stored', async () => {
    const logs = captureLogs();
    const { db, commands, executor, lampId } = await setup();
    db.failNext('finishCommand');
    await executor.run(commands.add({ device_id: lampId, capability: 'power', value: true }));
    expect(logs.events()).toContain('command.not_recorded');
  });
});
