import { TEST_AUTHOR } from '../support/automation-author';
import { join } from 'node:path';
import { API_ENDPOINTS, type DeviceEffect, type DeviceEffectTarget } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_FILE } from '../../src/service/configuration';
import { openStore, type Store } from '../../src/store/store';
import { bootServer, linkFakeProvider } from '../support/booted';
import { captureLogs, testLogger } from '../support/logs';
import { temporaryDirectory } from '../support/server';
import { legacyAutomation } from '../support/legacy-automation';
import { clientOf } from './support/client';
import { until } from './support/rig';

const HEAVY_MS = 30_000;

let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
});

afterEach(async () => {
  await directory.remove();
});

function whileStopped<T>(work: (store: Store) => T, at = new Date('2026-10-08T10:00:00.000Z')): T {
  const store = openStore({
    path: join(directory.path, DATABASE_FILE),
    log: testLogger('store'),
    now: () => at,
    systemTimeZone: 'UTC',
  });
  try {
    return work(store);
  } finally {
    store.close();
  }
}

async function firstBoot(): Promise<string> {
  const booted = await bootServer(directory.path);
  await linkFakeProvider(booted);
  const client = clientOf(booted.base, booted.owner);
  const devices = await client.request(API_ENDPOINTS.listDevices);
  await booted.server.stop();
  const lamp = devices.find((device) => device.external_id === 'lamp-1');
  if (lamp === undefined) throw new Error('The lamp was not discovered.');
  return lamp.id;
}

describe('C26 a restart never replays an unfinished run', () => {
  it(
    'marks runs that were unfinished when the hub stopped as interrupted and fails their open commands',
    async () => {
      const lamp = await firstBoot();
      const ids = whileStopped((store) => {
        const automation = store.automations.create({
          name: 'Unfinished',
          enabled: false,
          definition: legacyAutomation({
            triggers: [{ type: 'interval', everyMinutes: 60 }],
            conditions: { mode: 'all', items: [] },
            actions: [{ type: 'command', deviceId: lamp, capability: 'power', value: true }],
          }),
          origin: null,
          author: TEST_AUTHOR,
        });
        const run = store.automationRuns.create({
          automationId: automation.id,
          revision: automation.revision,
          ownerProfileId: null,
        });
        store.automationRuns.update(run.id, { status: 'running' });
        const [command] = store.commands.insert([
          {
            deviceId: lamp,
            capability: 'power',
            value: true,
            source: 'automation',
            requestedBy: null,
          },
        ]);
        if (command === undefined) throw new Error('No command was stored.');
        store.automationRuns.retainCommands(run.id, [command]);
        return { run: run.id, command: command.id };
      });
      const booted = await bootServer(directory.path);
      const client = clientOf(booted.base, booted.owner);
      const run = await client.request(API_ENDPOINTS.readAutomationRun, {
        params: { runId: ids.run },
      });
      const command = await client.request(API_ENDPOINTS.readCommand, {
        params: { commandId: ids.command },
      });
      await booted.server.stop();
      expect(run).toMatchObject({
        status: 'interrupted',
        error: 'The hub stopped before this run finished. Its actions were not replayed.',
      });
      expect(command).toMatchObject({
        status: 'failed',
        error: 'The hub stopped before the owned command outcome was known. It was not replayed.',
      });
      expect(booted.fake.adapter.executed).toStrictEqual([]);
    },
    HEAVY_MS,
  );
});

const FIRST = '4e000000-0000-4000-8000-000000000001';
const SECOND = '4e000000-0000-4000-8000-000000000011';

function stacked(device: string): DeviceEffectTarget {
  const effect = (id: string, value: number, priority: number, order: number): DeviceEffect => ({
    id,
    runId: '4e000000-0000-4000-8000-000000000002',
    nodeId: '4e000000-0000-4000-8000-000000000003',
    operation: { type: 'set', value },
    priority,
    order,
    expiresAt: '2026-10-08T11:00:00.000Z',
  });
  return {
    device_id: device,
    capability: 'brightness',
    base: 60,
    resolved: 80,
    effects: [effect(FIRST, 20, 0, 1), effect(SECOND, 80, 5, 2)],
    updated_at: '2026-10-08T10:00:00.000Z',
  };
}

describe('C19 a restart interrupts temporary changes', () => {
  it(
    'ends every stacked temporary change of a stopped hub and puts the control back to its base once',
    async () => {
      const lamp = await firstBoot();
      whileStopped((store) => store.deviceEffects.save(stacked(lamp)));
      const booted = await bootServer(directory.path);
      await until(() => booted.fake.adapter.executed.length >= 1);
      await booted.server.stop();
      expect(booted.fake.adapter.executed.map((command) => command.value)).toStrictEqual([60]);
      expect(whileStopped((store) => store.deviceEffects.list())).toStrictEqual([]);
    },
    HEAVY_MS,
  );

  it(
    'fails a temporary command that was still open when the hub stopped instead of replaying it',
    async () => {
      const lamp = await firstBoot();
      const open = whileStopped((store) => {
        store.deviceEffects.save(stacked(lamp));
        const [command] = store.commands.insert([
          {
            deviceId: lamp,
            capability: 'brightness',
            value: 80,
            source: 'automation',
            requestedBy: null,
          },
        ]);
        if (command === undefined) throw new Error('No command was stored.');
        return command.id;
      }, new Date());
      const booted = await bootServer(directory.path);
      await until(() => booted.fake.adapter.executed.length >= 1);
      await booted.server.stop();
      expect(booted.fake.adapter.executed.map((command) => command.value)).toStrictEqual([60]);
      expect(whileStopped((store) => store.commands.byId(open).status)).toBe('failed');
    },
    HEAVY_MS,
  );

  it(
    'still runs a person command that was open when the hub stopped, after putting the control back to its base',
    async () => {
      const lamp = await firstBoot();
      const open = whileStopped((store) => {
        store.deviceEffects.save(stacked(lamp));
        const [command] = store.commands.insert([
          { deviceId: lamp, capability: 'brightness', value: 40, source: 'app', requestedBy: null },
        ]);
        if (command === undefined) throw new Error('No command was stored.');
        return command.id;
      }, new Date());
      const booted = await bootServer(directory.path);
      await until(() => booted.fake.adapter.executed.length >= 2);
      await booted.server.stop();
      expect(booted.fake.adapter.executed.map((command) => command.value)).toStrictEqual([60, 40]);
      expect(whileStopped((store) => store.commands.byId(open).status)).toBe('succeeded');
    },
    HEAVY_MS,
  );
});
