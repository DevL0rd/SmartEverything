import type { RouterSnapshot } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { ChartPoint } from '../../../components/charts';
import type { MetricItem } from '../../../components/metric-strip';
import { count, decimal } from '../../../format/number';
import { clock } from '../../../format/time';

const PACKET_LOSS_WARNING = 2;
const KILOBYTES_PER_GIGABYTE = 1_048_576;

export interface StripSeries {
  readonly latency: readonly ChartPoint[];
  readonly cpu: readonly ChartPoint[];
  readonly memory: readonly ChartPoint[];
}

function reading(value: number | null | undefined, format: (value: number) => string): string {
  return value === null || value === undefined ? '—' : format(value);
}

function gigabytes(kilobytes: number): string {
  const gigabytesRounded = Math.round((kilobytes / KILOBYTES_PER_GIGABYTE) * 10) / 10;
  return decimal(gigabytesRounded, Number.isInteger(gigabytesRounded) ? 0 : 1);
}

function memoryCaption(system: NonNullable<RouterSnapshot['system']>): string {
  return `of ${gigabytes(system.memoryTotalKb)} GB · swap ${decimal(system.swapUsedPercent)} %`;
}

interface Shared {
  readonly stale: boolean;
  readonly caption?: string;
}

function sharedOf(snapshot: RouterSnapshot): Shared {
  const stale = snapshot.connection.state !== 'online';
  return stale ? { stale, caption: `as of ${clock(snapshot.at)}` } : { stale };
}

function networkItems(snapshot: RouterSnapshot, shared: Shared): readonly [MetricItem, MetricItem] {
  const { network } = snapshot;
  const loss = network?.packetLossPercent;
  const warn = loss !== null && loss !== undefined && loss > PACKET_LOSS_WARNING;
  return [
    {
      key: 'latency',
      label: 'Latency',
      value: reading(network?.latencyMs, (value) => decimal(value)),
      unit: 'ms',
      ...shared,
    },
    {
      key: 'loss',
      label: 'Packet loss',
      value: reading(loss, (value) => decimal(value, 1)),
      unit: '%',
      ...(warn ? { tone: 'warning' as const } : {}),
      ...shared,
    },
  ];
}

function systemItems(
  snapshot: RouterSnapshot,
  shared: Shared,
): readonly [MetricItem, MetricItem, MetricItem] {
  const { system } = snapshot;
  const memory =
    system === null || shared.stale ? shared : { stale: false, caption: memoryCaption(system) };
  return [
    {
      key: 'cpu',
      label: 'Router CPU',
      value: reading(system?.cpuPercent, (value) => decimal(value)),
      unit: '%',
      ...shared,
    },
    {
      key: 'memory',
      label: 'Memory',
      value: reading(system?.memoryUsedPercent, (value) => decimal(value)),
      unit: '%',
      ...memory,
    },
    {
      key: 'temperature',
      label: 'Temperature',
      value: reading(system?.temperatureCelsius, (value) => decimal(value)),
      unit: '°C',
      ...shared,
    },
  ];
}

function withSeries(
  items: readonly MetricItem[],
  series: Readonly<Record<string, readonly ChartPoint[]>>,
): readonly MetricItem[] {
  return items.map((item) => {
    const points = series[item.key];
    return points === undefined ? item : { ...item, series: points };
  });
}

export function stripItems(
  snapshot: RouterSnapshot,
  series: StripSeries,
  clientsHref: Href,
): readonly MetricItem[] {
  const shared = sharedOf(snapshot);
  const connected = snapshot.clients.filter((client) => client.connected).length;
  const [latency, loss] = networkItems(snapshot, shared);
  const system = systemItems(snapshot, shared);
  const online: MetricItem = {
    key: 'online',
    label: 'Devices online',
    value: count(connected),
    href: clientsHref,
    ...shared,
  };
  return withSeries([latency, loss, online, ...system], {
    latency: series.latency,
    cpu: series.cpu,
    memory: series.memory,
  });
}
