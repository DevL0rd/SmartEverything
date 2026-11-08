import {
  COMPUTER_ROLE_MODELS,
  DEFAULT_COMPUTER_SCOPES,
  NODE_PROTOCOL_VERSION,
  NODE_HELLO,
  type ComputerLiveNotice,
  type ComputerSummary,
  type DiscoveredDevice,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { computerDriver, type ComputerDriverOptions } from '../../src/computers/computer-driver';
import { HUB_EXTERNAL_ID } from '../../src/computers/computer-device';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerNode } from '../../src/node/computer-node';
import { Viewers } from '../../src/metrics/viewers';
import { MetricHistory } from '../../src/metrics/history';
import { testStore } from '../support/store';
import { captureLogs, testLogger } from '../support/logs';
import { stubControls } from '../support/paired-computer';
import { until } from '../support/wait';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const HELLO = NODE_HELLO.parse({
  protocol: NODE_PROTOCOL_VERSION,
  machineId: 'abcdefabcdefabcdefabcdefabcdefab',
  hostname: 'nas',
  os: { name: 'Linux', kernel: '6.18' },
  hardware: { vendor: 'UGREEN', product: 'DXP2800', portable: false },
  cpu: { model: 'Intel N100', threads: 4, hybrid: false },
  memoryBytes: 16e9,
  interfaces: [],
  bootedAt: NOW.toISOString(),
});
const SUMMARY: ComputerSummary = {
  cpuLoad: 12,
  cpuTemperature: 40,
  memoryPercent: 25,
  swapPercent: null,
  gpuLoad: null,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: null,
  gpuWatts: null,
  downloadRate: 123,
  uploadRate: 45,
  fullestDisk: null,
  batteryLevel: null,
  charging: null,
  totalWatts: null,
  processCount: 20,
  uptimeSeconds: 60,
};

describe('the local hub computer', () => {
  it('uses the existing computer sampler and session on the stable hub row and stops them', async () => {
    captureLogs();
    const opened = await testStore();
    const devices: DiscoveredDevice[] = [];
    const notices: ComputerLiveNotice[] = [];
    const stopped = vi.fn();
    const directory = new ComputerDirectory(HELLO.machineId);
    const deviceIdOf = (externalId: string): string | undefined =>
      opened.store.devices.list().find((device) => device.external_id === externalId)?.id;
    const publish = (items: readonly DiscoveredDevice[]): void => {
      devices.push(...items);
      opened.store.devices.upsert(
        items.map((device) => ({
          ...device,
          parentId: null,
          providerRoom: null,
          roomId: null,
        })),
      );
    };
    const options: ComputerDriverOptions = {
      history: new MetricHistory({
        store: opened.store.deviceMetrics,
        log: testLogger(),
        now: () => NOW,
      }),
      viewers: new Viewers(),
      policyOf: () => ({ window_ms: 3_600_000, interval_ms: 1_000 }),
      publish: (notice) => {
        notices.push(notice);
      },
      deviceIdOf,
      scopesOf: () => DEFAULT_COMPUTER_SCOPES,
      directory,
      records: {
        originOf: () => ({ source: 'app', client: null, clientId: null }),
        visibleTo: () => true,
        macsOf: () => [],
        wake: () => Promise.resolve(),
        approve: () => Promise.resolve(),
      },
      recordAppTime: () => undefined,
      signals: { emit: () => undefined },
      personOf: () => null,
      hub: { hostname: 'nas', osName: 'Linux' },
      bindHubDevice: () => undefined,
      createLocal: (link) =>
        new ComputerNode({
          collector: {
            hello: () => HELLO,
            readers: {
              summary: () => SUMMARY,
              cpu: () => null,
              gpu: () => null,
              memory: () => null,
              disks: () => null,
              network: () => null,
              sensors: () => null,
              power: () => null,
            },
            track: () => undefined,
            stop: stopped,
          },
          controls: stubControls(),
          link,
          now: () => NOW,
          log: testLogger(),
        }),
      now: () => NOW,
      log: testLogger(),
    };
    let stop: (() => Promise<void>) | undefined;
    try {
      stop = await computerDriver(options).start({
        sink: {
          devices: publish,
          state: () => undefined,
          event: () => undefined,
          online: () => undefined,
          failure: () => undefined,
        },
        publishDevices: (items) => {
          publish(items);
          return Promise.resolve();
        },
        publishEvent: () => Promise.resolve(''),
        forget: () => Promise.resolve(),
        signal: new AbortController().signal,
      });
      await until(
        () => Promise.resolve(notices.some((notice) => notice.parts.summary !== undefined)),
        'hub computer metrics',
      );
      const rows = opened.store.devices.list();
      expect(rows).toHaveLength(1);
      const row = rows.at(0);
      expect(row).toMatchObject({ external_id: HUB_EXTERNAL_ID, model: COMPUTER_ROLE_MODELS.hub });
      if (row === undefined) throw new Error('Hub device missing');
      expect(directory.byDevice(row.id).view()).toMatchObject({
        role: 'hub',
        parts: { summary: SUMMARY },
        hello: { cpu: { model: 'Intel N100' } },
      });
      expect(devices.at(-1)?.capabilities.some((capability) => capability.key === 'cpu_load')).toBe(
        true,
      );
      expect(notices.at(-1)).toMatchObject({ deviceId: row.id });
      await stop();
      stop = undefined;
      expect(stopped).toHaveBeenCalledOnce();
      expect(directory.all()).toHaveLength(0);
    } finally {
      await stop?.();
      await opened.close();
    }
  });
});
