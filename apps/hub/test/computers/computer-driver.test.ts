import { DEFAULT_COMPUTER_SCOPES, COMPUTER_ROLE_MODELS } from '@smarteverything/domain';
import type { DiscoveredDevice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computerDriver, type ComputerDriverOptions } from '../../src/computers/computer-driver';
import { HUB_EXTERNAL_ID } from '../../src/computers/computer-device';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import type { DeviceDriverContext } from '../../src/local/device-driver';
import { MetricHistory } from '../../src/metrics/history';
import { Viewers } from '../../src/metrics/viewers';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T09:00:00.000Z');

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function deviceIdOf(externalId: string): string | undefined {
  return opened.store.devices.list().find((device) => device.external_id === externalId)?.id;
}

function options(bound: string[]): ComputerDriverOptions {
  return {
    history: new MetricHistory({
      store: opened.store.deviceMetrics,
      log: testLogger('metrics'),
      now: () => NOW,
    }),
    viewers: new Viewers(),
    policyOf: () => ({ window_ms: 3_600_000, interval_ms: 1_000 }),
    publish: (): void => undefined,
    deviceIdOf,
    scopesOf: () => DEFAULT_COMPUTER_SCOPES,
    directory: new ComputerDirectory(),
    records: {
      originOf: () => ({ source: 'app', client: null, clientId: null }),
      visibleTo: () => true,
      macsOf: () => [],
      wake: () => Promise.resolve(),
      approve: () => Promise.resolve(),
    },
    recordAppTime: (): void => undefined,
    signals: { emit: (): void => undefined },
    personOf: () => null,
    hub: { hostname: 'nas', osName: 'Linux' },
    bindHubDevice: (deviceId): void => {
      bound.push(deviceId);
    },
    now: () => NOW,
    log: testLogger('computers'),
  };
}

function context(published: DiscoveredDevice[][]): DeviceDriverContext {
  return {
    sink: {
      state: (): void => undefined,
      event: (): void => undefined,
      online: (): void => undefined,
      devices: (): void => undefined,
      failure: (): void => undefined,
    },
    publishEvent: () => Promise.resolve(''),
    publishDevices: (devices): Promise<void> => {
      published.push([...devices]);
      opened.store.devices.upsert(
        devices.map((device) => ({
          ...device,
          parentId: null,
          providerRoom: null,
          roomId: null,
        })),
      );
      return Promise.resolve();
    },
    signal: new AbortController().signal,
    forget: () => Promise.resolve(),
  };
}

describe('the hub own device', () => {
  it('registers at start with the hub model and binds the runtimes to it', async () => {
    const bound: string[] = [];
    const published: DiscoveredDevice[][] = [];

    await computerDriver(options(bound)).start(context(published));

    const row = opened.store.devices
      .list()
      .find((device) => device.external_id === HUB_EXTERNAL_ID);
    expect(row?.model).toBe(COMPUTER_ROLE_MODELS.hub);
    expect(row?.name).toBe('nas');
    expect(bound).toEqual([row?.id]);
    expect(published).toHaveLength(1);
  });

  it('keeps one stable device across restarts', async () => {
    const bound: string[] = [];
    const driver = computerDriver(options(bound));

    await driver.start(context([]));
    await driver.start(context([]));

    expect(bound).toHaveLength(2);
    expect(bound[1]).toBe(bound[0]);
    expect(
      opened.store.devices.list().filter((device) => device.external_id === HUB_EXTERNAL_ID),
    ).toHaveLength(1);
  });

  it('refuses to start and accepts no node when the hub device cannot be registered', async () => {
    const driver = computerDriver(options([]));
    const failing: DeviceDriverContext = {
      ...context([]),
      publishDevices: () => Promise.resolve(),
    };

    await expect(driver.start(failing)).rejects.toThrow('The hub device was not registered.');
    expect(() =>
      driver.attach({ send: (): void => undefined, onFrame: () => (): void => undefined }),
    ).toThrow();
  });
});
