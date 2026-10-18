import type { PhoneDetail } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { bytes } from '../../../format/number';

export type NetworkSection = NonNullable<PhoneDetail['network']>;

export type Bluetooth = NonNullable<PhoneDetail['connections']>['bluetooth'][number];

export type SignalWord = 'No signal' | 'Weak' | 'Fair' | 'Good' | 'Excellent';

const SIGNAL_WORDS: readonly SignalWord[] = ['No signal', 'Weak', 'Fair', 'Good', 'Excellent'];

export type SignalTone = 'positive' | 'warning' | 'critical' | 'faint';

const GOOD_BARS = 3;
const FAIR_BARS = 2;

export function signalWord(bars: number): SignalWord {
  return SIGNAL_WORDS[Math.min(Math.max(bars, 0), SIGNAL_WORDS.length - 1)] ?? 'No signal';
}

export function signalTone(bars: number): SignalTone {
  if (bars >= GOOD_BARS) return 'positive';
  if (bars >= FAIR_BARS) return 'warning';
  return bars === 0 ? 'faint' : 'critical';
}

export function connectionTitle(network: NetworkSection, showName: boolean): string {
  if (network.kind === 'wifi') return showName ? (network.wifi?.ssid ?? 'Wi-Fi') : 'Wi-Fi';
  if (network.kind === 'cellular') return network.cellular?.operator ?? 'Mobile data';
  if (network.kind === 'ethernet') return 'Ethernet';
  return network.kind === 'offline' ? 'Offline' : 'Connected';
}

export function linkText(wifi: NonNullable<NetworkSection['wifi']>, live: boolean): string {
  const speed = `${String(wifi.linkMbps)} Mbps`;
  const band = wifi.bandGhz > 0 ? `${String(wifi.bandGhz)} GHz` : null;
  const level = live ? `${String(wifi.rssiDbm)} dBm` : null;
  return [level, speed, band].filter((part) => part !== null).join(' · ');
}

export function activeBars(network: NetworkSection): number {
  if (network.kind === 'wifi') return network.wifi?.bars ?? 0;
  if (network.kind === 'cellular') return network.cellular?.bars ?? 0;
  return 0;
}

export interface DataRow {
  readonly key: string;
  readonly label: string;
  readonly wifi: number;
  readonly mobile: number;
  readonly total: string;
  readonly spoken: string;
}

function dataRow(
  key: string,
  label: string,
  use: { wifiBytes: number; mobileBytes: number },
): DataRow {
  const total = use.wifiBytes + use.mobileBytes;
  return {
    key,
    label,
    wifi: use.wifiBytes,
    mobile: use.mobileBytes,
    total: bytes(total),
    spoken: `${label}: Wi-Fi ${bytes(use.wifiBytes)}, mobile ${bytes(use.mobileBytes)}`,
  };
}

export function dataRows(data: NetworkSection['data']): readonly DataRow[] {
  if (data === null) return [];
  return [dataRow('today', 'Today', data.today), dataRow('month', 'This month', data.month)];
}

const BLUETOOTH_ICON: Readonly<Record<Bluetooth['kind'], IconName>> = {
  watch: 'watch',
  headset: 'headphones',
  speaker: 'speaker',
  car: 'car',
  computer: 'laptop',
  other: 'bluetooth',
};

const BLUETOOTH_TEXT: Readonly<Record<Bluetooth['kind'], string>> = {
  watch: 'Watch',
  headset: 'Headset',
  speaker: 'Speaker',
  car: 'Car',
  computer: 'Computer',
  other: 'Bluetooth device',
};

export function bluetoothIcon(kind: Bluetooth['kind']): IconName {
  return BLUETOOTH_ICON[kind];
}

export function bluetoothName(device: Bluetooth): string {
  return device.name === null || device.name === '' ? BLUETOOTH_TEXT[device.kind] : device.name;
}

export interface TrailPoint {
  readonly t: number;
  readonly v: number;
}

export function pushTrail(
  trail: readonly TrailPoint[],
  point: TrailPoint,
  spanMs: number,
): readonly TrailPoint[] {
  const last = trail.at(-1);
  if (last !== undefined && last.t >= point.t) return trail;
  return [...trail, point].filter((entry) => point.t - entry.t <= spanMs);
}
