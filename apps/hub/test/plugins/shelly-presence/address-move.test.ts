import { JSON_VALUE } from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginTool } from '../../../src/plugins/builtin/contract';
import { startShelly } from '../../../src/plugins/builtin/shelly-presence/runtime';
import {
  SHELLY_SETTINGS,
  type ShellyContext,
} from '../../../src/plugins/builtin/shelly-presence/settings';
import { testLogger } from '../../support/logs';
import {
  DEVICE_ID,
  FakeShelly,
  enrollmentAt,
  memoryRecords,
  memorySecrets,
  until,
} from './fake-shelly';
import { driverContext } from './harness';

interface Candidate {
  readonly name: string;
  readonly host: string;
  readonly address: string;
  readonly generation: string | null;
}

const watcher = vi.hoisted(() => {
  const state: { observe: ((candidate: Candidate) => void) | null } = { observe: null };
  return state;
});

vi.mock('../../../src/plugins/builtin/shelly-presence/discovery', () => ({
  discoverShelly: (): Promise<unknown> =>
    Promise.resolve({ available: true, reason: null, candidates: [] }),
  watchShelly: (observe: (candidate: Candidate) => void): (() => Promise<void>) => {
    watcher.observe = observe;
    return () => Promise.resolve();
  },
}));

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  watcher.observe = null;
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe('a Shelly sensor that comes back on another address', () => {
  it('follows its announcement, reconnects and saves the new address', async () => {
    const shelly = await FakeShelly.open();
    const oldAddress = 'http://127.0.0.1:1';
    const enrollments = memoryRecords();
    enrollments.put(DEVICE_ID, JSON_VALUE.parse(enrollmentAt(oldAddress)));
    const tools: PluginTool[] = [];
    const drivers: Parameters<ShellyContext['devices']['register']>[0][] = [];
    const ctx: ShellyContext = {
      records: (collection) => (collection === 'enrollments' ? enrollments : memoryRecords()),
      secrets: memorySecrets(),
      tools: { register: (added): void => void tools.push(...added) },
      devices: {
        register: (driver) => {
          drivers.push(driver);
          return (): void => undefined;
        },
        command: () => Promise.reject(new Error('the plugin runs its own commands')),
      },
      data: { publish: vi.fn() },
      search: { replace: vi.fn() },
      settings: SHELLY_SETTINGS.parse({}),
      settingsChanged: () => (): void => undefined,
      clients: { gone: () => (): void => undefined },
      viewers: { watchDevice: () => (): void => undefined },
      signal: new AbortController().signal,
      log: testLogger('shelly'),
    };
    const stop = await startShelly(ctx);
    cleanups.push(async () => {
      await stop();
      await shelly.close();
    });
    const [driver] = drivers;
    if (driver === undefined) throw new Error('no driver registered');
    cleanups.push(await driver.start(driverContext(vi.fn(), []).context));
    const url = new URL(shelly.address);
    watcher.observe?.({
      name: DEVICE_ID,
      host: 'shelly.local',
      address: shelly.address,
      generation: '4',
    });
    await until(() => {
      const saved = enrollments.get(DEVICE_ID);
      return JSON.stringify(saved).includes(url.origin);
    }, 'the saved address');
    await until(() => shelly.calls.length > 0, 'a request on the new address');
    expect(JSON.stringify(enrollments.get(DEVICE_ID))).toContain(url.origin);
  });
});
