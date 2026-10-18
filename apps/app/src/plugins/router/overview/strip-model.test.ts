import type { RouterSnapshot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { stripItems } from './strip-model';

const SYSTEM: NonNullable<RouterSnapshot['system']> = {
  cpuPercent: 14,
  corePercents: [],
  load: [0, 0, 0],
  memoryUsedPercent: 46,
  memoryTotalKb: 1_048_576,
  swapUsedPercent: 0,
  temperatureCelsius: 61,
  connections: 412,
  connectionsMax: 300_000,
};

function snapshot(
  state: 'online' | 'paused',
  loss: number | null,
  system: RouterSnapshot['system'] = SYSTEM,
): RouterSnapshot {
  return {
    at: '2026-10-17T13:45:00.000+00:00',
    connection: { state },
    cadence: 'fast',
    intervalSeconds: 2,
    info: null,
    system,
    network: {
      wanUp: true,
      protocol: null,
      publicIp: null,
      gateway: null,
      dns: [],
      downloadMbps: 1,
      uploadMbps: 1,
      lanDownloadMbps: 0,
      lanUploadMbps: 0,
      latencyMs: 12,
      packetLossPercent: loss,
      ports: [],
    },
    radios: [],
    stations: [],
    clients: [],
  };
}

const NO_SERIES = { latency: [], cpu: [], memory: [] };

describe('stripItems', () => {
  it('lists the six health readings with the memory size and swap', () => {
    const items = stripItems(snapshot('online', 0.2), NO_SERIES, '/pair');
    expect(items.map((item) => item.label)).toEqual([
      'Latency',
      'Packet loss',
      'Devices online',
      'Router CPU',
      'Memory',
      'Temperature',
    ]);
    expect(items[4]?.caption).toBe('of 1 GB · swap 0 %');
    expect(items.every((item) => item.stale === false)).toBe(true);
  });

  it('warns about packet loss above two percent only', () => {
    expect(stripItems(snapshot('online', 4.1), NO_SERIES, '/pair')[1]?.tone).toBe('warning');
    expect(stripItems(snapshot('online', 2), NO_SERIES, '/pair')[1]?.tone).toBeUndefined();
  });

  it('dims every tile with the time of the last reading when monitoring is not live', () => {
    const items = stripItems(snapshot('paused', 0.2), NO_SERIES, '/pair');
    expect(items.every((item) => item.stale === true)).toBe(true);
    expect(items[0]?.caption).toMatch(/^as of /);
    expect(items[4]?.caption).toMatch(/^as of /);
  });

  it('writes a dash for a reading the router did not report', () => {
    const items = stripItems(snapshot('online', null, null), NO_SERIES, '/pair');
    expect(items[1]?.value).toBe('—');
    expect(items[3]?.value).toBe('—');
  });
});
