import { randomUUID } from 'node:crypto';
import type { CommandRow, DeviceCommand, JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolCaller } from '../../src/ai-tools/hub-tool';
import type { DeviceDriver } from '../../src/local/device-driver';
import { commandPorts } from '../../src/plugins/plugin-device-command';
import { testStore, type TestStore } from '../support/store';

const PLUGIN = 'sample';
const EXTERNAL = `${PLUGIN}:lamp`;
const caller: ToolCaller = {
  via: 'app',
  clientId: null,
  role: 'owner',
  profileId: randomUUID(),
  chatId: null,
};

let opened: TestStore;
let deviceId: string;

beforeEach(async () => {
  opened = await testStore();
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: EXTERNAL,
      parentId: null,
      kind: 'light',
      name: 'Lamp',
      model: 'l1',
      manufacturer: 'Sample',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [
        { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
      ],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The lamp was not stored.');
  deviceId = row.id;
});

afterEach(async () => {
  await opened.close();
});

function setup(): {
  readonly seen: { readonly command: DeviceCommand; readonly submittedByPlugin: boolean }[];
  readonly driver: DeviceDriver;
  readonly ports: ReturnType<typeof commandPorts>;
  readonly submitted: CommandRow[];
} {
  const seen: { command: DeviceCommand; submittedByPlugin: boolean }[] = [];
  const submitted: CommandRow[] = [];
  const base: DeviceDriver = {
    id: PLUGIN,
    start: () => Promise.resolve(() => Promise.resolve()),
    execute: (command, submittedByPlugin = false): Promise<JsonValue> => {
      seen.push({ command, submittedByPlugin });
      return Promise.resolve('done');
    },
  };
  const ports = commandPorts(
    {
      store: opened.store,
      drivers: { deviceIdOf: (external) => (external === EXTERNAL ? deviceId : undefined) },
      now: () => new Date('2026-10-08T10:00:00.000Z'),
      submit: (commands) => {
        const rows = opened.store.commands.insert(commands);
        submitted.push(...rows);
        return rows;
      },
    },
    { signal: new AbortController().signal },
    new Set([PLUGIN]),
  );
  return { seen, driver: ports.withTransientValues(base), ports, submitted };
}

describe('plugin device command port', () => {
  it('tells the driver a command came from the plugin only while the plugin awaits it', async () => {
    const { seen, driver, ports, submitted } = setup();
    const pending = ports.command(
      { externalId: EXTERNAL, capability: 'power', value: true },
      caller,
    );
    const [row] = submitted;
    if (row === undefined) throw new Error('The command was not submitted.');
    const command = {
      commandId: row.id,
      externalId: EXTERNAL,
      capability: 'power',
      value: true,
    } as const;
    await driver.execute(command);
    opened.store.commands.finish(row.id, { status: 'succeeded', result: 'done' });
    await expect(pending).resolves.toBe('done');
    await driver.execute(command);
    expect(seen.map((entry) => entry.submittedByPlugin)).toEqual([true, false]);
  });

  it('reports a command nobody in the plugin submitted as not submitted by the plugin', async () => {
    const { seen, driver } = setup();
    await driver.execute({
      commandId: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
      externalId: EXTERNAL,
      capability: 'power',
      value: true,
    });
    expect(seen.map((entry) => entry.submittedByPlugin)).toEqual([false]);
  });
});
