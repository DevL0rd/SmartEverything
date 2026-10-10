import { isIPv4 } from 'node:net';
import type { CollectOutput, Fields } from './collect-parse';
import { numberOf, roundTo } from './frame-math';

export interface WanState {
  readonly up: boolean | null;
  readonly protocol: string | null;
  readonly publicIp: string | null;
  readonly gateway: string | null;
  readonly dns: readonly string[];
}

interface RadioState {
  readonly band: string;
  readonly interfaceName: string | null;
  readonly channel: number | null;
  readonly width: string | null;
  readonly noiseDbm: number | null;
  readonly temperatureCelsius: number | null;
  readonly airtimeBusyPercent: number | null;
  readonly dfs: string | null;
}

export interface LeaseEntry {
  readonly mac: string;
  readonly ip: string | null;
  readonly name: string | null;
}

export interface SlowState {
  readonly wan: WanState;
  readonly radios: readonly RadioState[];
  readonly leases: readonly LeaseEntry[];
  readonly reachableMacs: ReadonlySet<string>;
  readonly blockedMacs: ReadonlySet<string>;
}

export interface RadioSettings {
  readonly ssid: string | null;
  readonly enabled: boolean | null;
  readonly txPower: number | null;
}

export interface StaticState {
  readonly model: string | null;
  readonly firmware: string | null;
  readonly lanIp: string | null;
  readonly ports: readonly { readonly port: string; readonly link: string }[];
  readonly radios: ReadonlyMap<string, RadioSettings>;
}

export interface StationSignal {
  readonly rssiDbm: number | null;
  readonly txMbps: number;
  readonly rxMbps: number;
}

export function textOf(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function readSlow(output: CollectOutput): SlowState | null {
  if (output.values.get('SLOW') !== '1') {
    return null;
  }
  return {
    wan: readWan(output.values),
    radios: output.radios.flatMap(readRadio),
    leases: output.leases.flatMap(readLease),
    reachableMacs: new Set(output.reachableMacs),
    blockedMacs: new Set(output.blockedMacs),
  };
}

export function readStatic(output: CollectOutput): StaticState | null {
  if (output.values.get('STATIC') !== '1') {
    return null;
  }
  const upPorts = output.ports.filter((port) => port.link.includes('Up'));
  return {
    model: textOf(output.values.get('model')),
    firmware: textOf(output.values.get('fw')),
    lanIp: textOf(output.values.get('lan_ip')),
    ports: upPorts.length > 0 ? upPorts : output.ports,
    radios: new Map(output.radioSettings.flatMap(readRadioSettings)),
  };
}

export function readStationSignals(
  output: CollectOutput,
): ReadonlyMap<string, StationSignal> | null {
  if (output.values.get('SLOW') !== '1') {
    return null;
  }
  return new Map(
    output.stationSignals.flatMap((fields): [string, StationSignal][] => {
      const mac = textOf(fields['mac']);
      if (mac === null) {
        return [];
      }
      return [
        [
          mac.toLowerCase(),
          {
            rssiDbm: numberOf(fields['rssi']),
            txMbps: roundTo((numberOf(fields['txrate']) ?? 0) / 1000, 1),
            rxMbps: roundTo((numberOf(fields['rxrate']) ?? 0) / 1000, 1),
          },
        ],
      ];
    }),
  );
}

function readWan(values: ReadonlyMap<string, string>): WanState {
  const state = textOf(values.get('wan_state'));
  return {
    up: state === null ? null : state === '2',
    protocol: textOf(values.get('wan_proto')),
    publicIp: textOf(values.get('wan_ip')),
    gateway: textOf(values.get('wan_gw')),
    dns: (values.get('wan_dns') ?? '').split(/\s+/).filter((server) => server.length > 0),
  };
}

function readRadio(fields: Fields): RadioState[] {
  const band = textOf(fields['band']);
  if (band === null) {
    return [];
  }
  return [
    {
      band,
      interfaceName: textOf(fields['ifc']),
      channel: numberOf(fields['chan']),
      width: textOf(fields['width']),
      noiseDbm: numberOf(fields['noise']),
      temperatureCelsius: numberOf(fields['temp']),
      airtimeBusyPercent: numberOf(fields['busy']),
      dfs: textOf(fields['dfs']),
    },
  ];
}

function readLease(fields: Fields): LeaseEntry[] {
  const mac = textOf(fields['mac']);
  if (mac === null) {
    return [];
  }
  const name = textOf(fields['name']);
  const ip = textOf(fields['ip']);
  return [
    {
      mac: mac.toLowerCase(),
      ip: ip !== null && isIPv4(ip) ? ip : null,
      name: name === '*' ? null : name,
    },
  ];
}

function readRadioSettings(fields: Fields): [string, RadioSettings][] {
  const band = textOf(fields['band']);
  if (band === null) {
    return [];
  }
  const radio = textOf(fields['radio']);
  return [
    [
      band,
      {
        ssid: textOf(fields['ssid']),
        enabled: radio === null ? null : radio === '1',
        txPower: numberOf(fields['txpower']),
      },
    ],
  ];
}
