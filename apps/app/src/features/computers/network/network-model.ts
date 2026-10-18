import type {
  BluetoothDevice,
  InterfaceKind,
  InterfaceSnapshot,
  WifiNetwork,
} from '@smarteverything/domain';
import { formatMegabits } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { compareText, joinParts } from '../../../format/text';

const DBM_AT_ZERO = -100;
const PERCENT_PER_DBM = 2;

export function dbmOfPercent(percent: number | null): number | null {
  return percent === null ? null : Math.round(percent / PERCENT_PER_DBM + DBM_AT_ZERO);
}

export const ADAPTER_ICON: Readonly<Record<InterfaceKind, IconName>> = {
  wifi: 'wifi',
  ethernet: 'router',
  vpn: 'shield',
  bridge: 'layers',
  other: 'globe',
};

const ADAPTER_KIND: Readonly<Record<InterfaceKind, string>> = {
  wifi: 'Wi-Fi',
  ethernet: 'Ethernet',
  vpn: 'VPN',
  bridge: 'Virtual bridge',
  other: 'Network',
};

const KIND_ORDER: readonly InterfaceKind[] = ['wifi', 'ethernet', 'other', 'bridge', 'vpn'];

export interface StateWord {
  readonly word: string;
  readonly tone: Tone;
}

export function adapterState(state: InterfaceSnapshot['state']): StateWord {
  if (state === 'up') return { word: 'Connected', tone: 'positive' };
  if (state === 'down') return { word: 'Not connected', tone: 'faint' };
  return { word: 'Status not known', tone: 'faint' };
}

export function adapterLine(adapter: Pick<InterfaceSnapshot, 'name' | 'speedMbps'>): string {
  return joinParts([
    adapter.name,
    adapter.speedMbps === null ? null : formatMegabits(adapter.speedMbps),
  ]);
}

export function showsTraffic(adapter: Pick<InterfaceSnapshot, 'kind' | 'state'>): boolean {
  return adapter.kind !== 'vpn' && adapter.kind !== 'bridge' && adapter.state === 'up';
}

interface AdapterRef {
  readonly name: string;
  readonly title: string;
  readonly kind: InterfaceKind;
  readonly state: InterfaceSnapshot['state'];
}

export interface AdapterGroups {
  readonly connected: readonly AdapterRef[];
  readonly idle: readonly AdapterRef[];
}

function byKind(left: InterfaceSnapshot, right: InterfaceSnapshot): number {
  const lead = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
  return lead === 0 ? compareText(left.name, right.name) : lead;
}

function titled(sorted: readonly InterfaceSnapshot[]): readonly AdapterRef[] {
  const total = new Map<InterfaceKind, number>();
  for (const { kind } of sorted) total.set(kind, (total.get(kind) ?? 0) + 1);
  const seen = new Map<InterfaceKind, number>();
  return sorted.map(({ name, kind, state }) => {
    const index = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, index);
    const word = ADAPTER_KIND[kind];
    return {
      name,
      kind,
      state,
      title: (total.get(kind) ?? 0) > 1 ? `${word} ${String(index)}` : word,
    };
  });
}

export function adapterGroups(adapters: readonly InterfaceSnapshot[]): AdapterGroups {
  const refs = titled([...adapters].sort(byKind));
  return {
    connected: refs.filter((adapter) => adapter.state === 'up'),
    idle: refs.filter((adapter) => adapter.state !== 'up'),
  };
}

export function addressLabel(address: string): string {
  return address.includes(':') ? 'IPv6' : 'IPv4';
}

export function isOnlyWifiLink(adapters: readonly InterfaceSnapshot[]): boolean {
  const wifiUp = adapters.some((adapter) => adapter.kind === 'wifi' && adapter.state === 'up');
  const otherUp = adapters.some(
    (adapter) => adapter.kind !== 'wifi' && adapter.kind !== 'vpn' && adapter.state === 'up',
  );
  return wifiUp && !otherUp;
}

export function wifiLine(enabled: boolean, networks: readonly WifiNetwork[]): string {
  if (!enabled) return 'Off';
  const current = networks.find((network) => network.connected);
  return current === undefined ? 'Not connected' : `Connected to ${current.ssid}`;
}

export function knownNetworks(networks: readonly WifiNetwork[]): readonly WifiNetwork[] {
  return networks
    .filter((network) => network.known || network.connected)
    .sort((left, right) => {
      const lead = Number(right.connected) - Number(left.connected);
      return lead === 0 ? compareText(left.ssid, right.ssid) : lead;
    });
}

export function bluetoothLine(enabled: boolean, devices: readonly BluetoothDevice[]): string {
  if (!enabled) return 'Off';
  const connected = devices.filter((device) => device.connected).length;
  return connected === 0 ? 'On' : `${String(connected)} connected`;
}

export function bluetoothOrder(devices: readonly BluetoothDevice[]): readonly BluetoothDevice[] {
  return [...devices].sort((left, right) => {
    const lead = Number(right.connected) - Number(left.connected);
    return lead === 0 ? compareText(left.name, right.name) : lead;
  });
}

export function bluetoothDeviceLine(device: BluetoothDevice): string {
  return joinParts([
    device.connected ? 'Connected' : 'Not connected',
    device.batteryPercent === null
      ? null
      : `${String(Math.round(device.batteryPercent))} % battery`,
  ]);
}
