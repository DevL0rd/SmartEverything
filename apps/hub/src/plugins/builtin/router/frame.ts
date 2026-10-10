import type { NetworkClient, RouterSnapshot } from '@smarteverything/domain';
import type { CollectOutput, Fields, InterfaceCounters } from './collect-parse';
import {
  clampPercent,
  cpuPercents,
  megabitsPerSecond,
  numberOf,
  percentOf,
  perSecond,
  roundTo,
} from './frame-math';
import {
  readSlow,
  readStatic,
  readStationSignals,
  textOf,
  type LeaseEntry,
  type RadioSettings,
  type SlowState,
  type StaticState,
  type StationSignal,
  type WanState,
} from './frame-parts';

interface Ping {
  readonly latencyMs: number;
  readonly lossPercent: number;
}

export interface FrameState {
  readonly routerTime: number;
  readonly cpuTimes: ReadonlyMap<string, readonly number[]>;
  readonly interfaces: ReadonlyMap<string, InterfaceCounters>;
  readonly slow: SlowState | null;
  readonly staticInfo: StaticState | null;
  readonly signals: ReadonlyMap<string, StationSignal>;
  readonly ping: Ping | null;
}

export type FrameParts = Pick<
  RouterSnapshot,
  'info' | 'system' | 'network' | 'radios' | 'stations' | 'clients'
>;

type Station = RouterSnapshot['stations'][number];

export function wirelessInterfaces(state: FrameState | null): string[] {
  return (state?.slow?.radios ?? []).flatMap((radio) =>
    radio.interfaceName === null ? [] : [radio.interfaceName],
  );
}

export function buildFrame(
  output: CollectOutput,
  previous: FrameState | null,
): { readonly parts: FrameParts; readonly state: FrameState } {
  const state = nextState(output, previous);
  const seconds = previous === null ? 0 : state.routerTime - previous.routerTime;
  const stations = readStations(output, state.signals);
  const parts: FrameParts = {
    info: readInfo(output, state.staticInfo),
    system: readSystem(output, state, previous),
    network: readNetwork(output, state, previous, seconds),
    radios: readRadios(output, state),
    stations,
    clients: readClients(state.slow, stations),
  };
  return { parts, state };
}

const NO_HISTORY = {
  slow: null,
  staticInfo: null,
  signals: new Map<string, StationSignal>(),
  ping: null,
} as const;

function carry<T>(fresh: T | null, previous: T): T {
  return fresh ?? previous;
}

function nextState(output: CollectOutput, previous: FrameState | null): FrameState {
  const before = previous ?? NO_HISTORY;
  return {
    routerTime: numberOf(output.values.get('TS')) ?? Date.now() / 1000,
    cpuTimes: output.cpuTimes,
    interfaces: output.interfaces,
    slow: carry<SlowState | null>(readSlow(output), before.slow),
    staticInfo: carry<StaticState | null>(readStatic(output), before.staticInfo),
    signals: carry(readStationSignals(output), before.signals),
    ping: carry<Ping | null>(readPing(output), before.ping),
  };
}

function readPing(output: CollectOutput): Ping | null {
  const latencyMs = numberOf(output.values.get('ping_rtt'));
  if (latencyMs === null) {
    return null;
  }
  return {
    latencyMs: roundTo(latencyMs, 1),
    lossPercent: clampPercent(numberOf(output.values.get('ping_loss')) ?? 0),
  };
}

function readInfo(output: CollectOutput, staticInfo: StaticState | null): RouterSnapshot['info'] {
  return {
    model: staticInfo?.model ?? null,
    firmware: staticInfo?.firmware ?? null,
    lanIp: staticInfo?.lanIp ?? null,
    uptimeSeconds: numberOf(output.values.get('uptime')) ?? 0,
  };
}

function readSystem(
  output: CollectOutput,
  state: FrameState,
  previous: FrameState | null,
): RouterSnapshot['system'] {
  const value = (key: string): number => numberOf(output.values.get(key)) ?? 0;
  const cpu = cpuPercents(state.cpuTimes, previous?.cpuTimes ?? null);
  const swapTotal = value('swap_total');
  const temperature = numberOf(output.values.get('cpu_temp_milli'));
  return {
    cpuPercent: cpu.total,
    corePercents: [...cpu.cores],
    load: [value('load1'), value('load5'), value('load15')],
    memoryUsedPercent: percentOf(value('mem_total') - value('mem_avail'), value('mem_total')),
    memoryTotalKb: value('mem_total'),
    swapUsedPercent: percentOf(swapTotal - value('swap_free'), swapTotal),
    temperatureCelsius: temperature === null ? null : roundTo(temperature / 1000, 1),
    connections: value('conntrack'),
    connectionsMax: value('conntrack_max'),
  };
}

interface Rates {
  readonly down: number;
  readonly up: number;
}

function ratesOf(
  name: string,
  state: FrameState,
  previous: FrameState | null,
  seconds: number,
): Rates {
  const current = state.interfaces.get(name);
  if (current === undefined) {
    return { down: 0, up: 0 };
  }
  const before = previous?.interfaces.get(name);
  return {
    down: megabitsPerSecond(perSecond(current.rx, before?.rx, seconds)),
    up: megabitsPerSecond(perSecond(current.tx, before?.tx, seconds)),
  };
}

const NO_WAN: WanState = { up: null, protocol: null, publicIp: null, gateway: null, dns: [] };

function readNetwork(
  output: CollectOutput,
  state: FrameState,
  previous: FrameState | null,
  seconds: number,
): RouterSnapshot['network'] {
  const wanName = textOf(output.values.get('wan_ifname')) ?? 'ppp0';
  const wan = ratesOf(wanName, state, previous, seconds);
  const lan = ratesOf('br0', state, previous, seconds);
  const slowWan = state.slow?.wan ?? NO_WAN;
  return {
    wanUp: slowWan.up,
    protocol: slowWan.protocol,
    publicIp: slowWan.publicIp,
    gateway: slowWan.gateway,
    dns: [...slowWan.dns],
    downloadMbps: wan.down,
    uploadMbps: wan.up,
    lanDownloadMbps: lan.down,
    lanUploadMbps: lan.up,
    latencyMs: state.ping?.latencyMs ?? null,
    packetLossPercent: state.ping?.lossPercent ?? null,
    ports: [...(state.staticInfo?.ports ?? [])],
  };
}

const NO_RADIO_SETTINGS: RadioSettings = { ssid: null, enabled: null, txPower: null };

function readRadios(output: CollectOutput, state: FrameState): RouterSnapshot['radios'] {
  const counts = new Map(
    output.radioCounts.map((fields) => [fields['band'] ?? '', numberOf(fields['clients']) ?? 0]),
  );
  return (state.slow?.radios ?? []).map(({ interfaceName: _interfaceName, ...radio }) => ({
    ...radio,
    ...(state.staticInfo?.radios.get(radio.band) ?? NO_RADIO_SETTINGS),
    clients: counts.get(radio.band) ?? 0,
  }));
}

function readStations(
  output: CollectOutput,
  signals: ReadonlyMap<string, StationSignal>,
): Station[] {
  return output.stations.flatMap((fields) => stationOf(fields, signals));
}

const NO_SIGNAL: StationSignal = { rssiDbm: null, txMbps: 0, rxMbps: 0 };

function stationOf(fields: Fields, signals: ReadonlyMap<string, StationSignal>): Station[] {
  const mac = textOf(fields['mac'])?.toLowerCase();
  const band = textOf(fields['band']);
  if (mac === undefined || band === null) {
    return [];
  }
  const signal = signals.get(mac) ?? NO_SIGNAL;
  return [
    {
      mac,
      band,
      rssiDbm: signal.rssiDbm,
      txMbps: signal.txMbps,
      rxMbps: signal.rxMbps,
      phyMbps: Math.round(numberOf(fields['phy']) ?? 0),
      trafficBytesPerSecond: Math.round((numberOf(fields['data_mbps']) ?? 0) * 125000),
    },
  ];
}

function readClients(slow: SlowState | null, stations: readonly Station[]): NetworkClient[] {
  const byMac = new Map(stations.map((station) => [station.mac, station]));
  const leases = slow?.leases ?? [];
  const leased = new Set(leases.map((lease) => lease.mac));
  const unleased = stations
    .filter((station) => !leased.has(station.mac))
    .map((station) => ({ mac: station.mac, ip: null, name: null }));
  return [...leases, ...unleased].map((entry) => clientOf(entry, byMac.get(entry.mac), slow));
}

function clientOf(
  entry: LeaseEntry,
  station: Station | undefined,
  slow: SlowState | null,
): NetworkClient {
  const reachable = slow?.reachableMacs.has(entry.mac) === true;
  const connected = station !== undefined || reachable;
  return {
    mac: entry.mac,
    name: entry.name ?? entry.ip ?? entry.mac,
    ip: entry.ip,
    connection: connectionOf(station, connected),
    band: station?.band ?? null,
    connected,
    blocked: slow?.blockedMacs.has(entry.mac) === true,
    trafficBytesPerSecond: station?.trafficBytesPerSecond ?? null,
    profileId: null,
    firstSeen: null,
    lastSeen: null,
  };
}

function connectionOf(
  station: Station | undefined,
  connected: boolean,
): NetworkClient['connection'] {
  if (station !== undefined) {
    return 'wifi';
  }
  return connected ? 'wired' : null;
}
