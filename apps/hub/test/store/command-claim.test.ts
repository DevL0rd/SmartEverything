import { saveAutomation, startRun, trigger } from '../support/automation-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDatabase } from '../../src/store/hub-database';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function lamp(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId: 'lamp-1',
      parentId: null,
      kind: 'light',
      name: 'Lamp',
      model: 'l1',
      manufacturer: 'Tuya',
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
  return row.id;
}

function powerOn(deviceId: string): Parameters<typeof opened.store.commands.insert>[0] {
  return [{ deviceId, capability: 'power', value: true, source: 'automation', requestedBy: null }];
}

describe('claiming a command', () => {
  it('runs a plain command', async () => {
    const { store } = opened;
    const [row] = store.commands.insert(powerOn(lamp()));
    if (row === undefined) throw new Error('No command was stored.');
    const database = storeDatabase(store, (path) => path);
    await expect(database.claimCommand(row.id, 'pending')).resolves.toBe(true);
    expect(store.commands.byId(row.id).status).toBe('running');
  });

  it('fails a command whose automation run was cancelled before it was dispatched', async () => {
    const { store } = opened;
    const automation = saveAutomation(store, {
      name: 'Ordered',
      triggers: [trigger('trigger.interval', { every: 300_000 })],
    });
    const run = startRun(store, automation.id, 'cancelled');
    const [row] = store.commands.insert(powerOn(lamp()));
    if (row === undefined) throw new Error('No command was stored.');
    store.automationRuns.retainCommands(run.id, [row]);
    const database = storeDatabase(store, (path) => path);
    await expect(database.claimCommand(row.id, 'pending')).resolves.toBe(false);
    expect(store.commands.byId(row.id)).toMatchObject({
      status: 'failed',
      error: 'The owning automation run was cancelled before command dispatch.',
    });
  });
});
