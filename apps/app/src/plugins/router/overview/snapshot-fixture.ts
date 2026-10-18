import type { RouterSnapshot } from '@smarteverything/domain';

export const ROUTER_AT = '2026-10-17T13:45:00.000+00:00';

export const NETWORK_FIXTURE: NonNullable<RouterSnapshot['network']> = {
  wanUp: true,
  protocol: 'dhcp',
  publicIp: null,
  gateway: null,
  dns: [],
  downloadMbps: 8.7,
  uploadMbps: 3.6,
  lanDownloadMbps: 0,
  lanUploadMbps: 0,
  latencyMs: 9,
  packetLossPercent: 0,
  ports: [],
};

export const SYSTEM_FIXTURE: NonNullable<RouterSnapshot['system']> = {
  cpuPercent: 12.4,
  corePercents: [12, 13],
  load: [0.1, 0.1, 0.1],
  memoryUsedPercent: 38.6,
  memoryTotalKb: 512_000,
  swapUsedPercent: 0,
  temperatureCelsius: 71.94,
  connections: 120,
  connectionsMax: 16_384,
};

function clientsFixture(online: number, total: number): RouterSnapshot['clients'] {
  return Array.from({ length: total }, (_, index) => ({
    mac: `aa:bb:cc:dd:ee:${index.toString(16).padStart(2, '0')}`,
    name: `Device ${String(index)}`,
    ip: `192.168.1.${String(10 + index)}`,
    connection: 'wifi',
    band: '5 GHz',
    connected: index < online,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId: null,
    firstSeen: null,
    lastSeen: null,
  }));
}

export function routerSnapshot(
  connection: RouterSnapshot['connection'] = { state: 'online' },
  patch: Partial<RouterSnapshot> = {},
): RouterSnapshot {
  return {
    at: ROUTER_AT,
    connection,
    cadence: 'fast',
    intervalSeconds: 1,
    info: null,
    system: SYSTEM_FIXTURE,
    network: NETWORK_FIXTURE,
    radios: [],
    stations: [],
    clients: clientsFixture(2, 3),
    ...patch,
  };
}
