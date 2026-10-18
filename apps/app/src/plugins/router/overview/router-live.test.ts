import type { RouterSnapshot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { ROUTER_DOWNLOAD, ROUTER_UPLOAD, routerReadings } from './router-live';

const NETWORK: NonNullable<RouterSnapshot['network']> = {
  wanUp: true,
  protocol: 'dhcp',
  publicIp: null,
  gateway: null,
  dns: [],
  downloadMbps: 8,
  uploadMbps: 0.8,
  lanDownloadMbps: 0,
  lanUploadMbps: 0,
  latencyMs: 12.3,
  packetLossPercent: 0,
  ports: [],
};

function snapshot(patch: Partial<RouterSnapshot>): RouterSnapshot {
  return {
    at: '2026-10-17T13:45:00.000+00:00',
    connection: { state: 'online' },
    cadence: 'fast',
    intervalSeconds: 1,
    info: null,
    system: null,
    network: NETWORK,
    radios: [],
    stations: [],
    clients: [],
    ...patch,
  };
}

describe('routerReadings', () => {
  it('turns megabits into the bytes per second the hub records, under the same keys', () => {
    const readings = new Map(routerReadings(snapshot({})));
    expect(readings.get(ROUTER_DOWNLOAD)).toBe(1_000_000);
    expect(readings.get(ROUTER_UPLOAD)).toBe(100_000);
    expect(readings.get('live/latency')).toBe(12.3);
    expect(readings.get('live/cpu_load')).toBeNull();
  });

  it('gives nothing while the router is not online', () => {
    expect(routerReadings(snapshot({ connection: { state: 'paused' } }))).toEqual([]);
  });
});
