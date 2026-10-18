import type { Href } from 'expo-router';
import type { ComputerMetric, ComputerSummary } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import type { ChartPoint } from '../../../components/charts';
import type { MetricItem } from '../../../components/metric-strip';
import { decimal } from '../../../format/number';
import { headlineOf } from './computer-headlines';
import { BUSY_PERCENT, diskSeverity, rateParts } from './computer-view';
import { sparkOf } from './strip-spark';

export const STRIP_SERIES = [
  'summary/cpuLoad',
  'summary/gpuLoad',
  'summary/memoryPercent',
  'summary/downloadRate',
  'summary/batteryLevel',
  'summary/totalWatts',
] as const;

type StripKey = (typeof STRIP_SERIES)[number];

export type StripSeries = Readonly<Record<StripKey, readonly ChartPoint[]>>;

export interface StripReadings {
  readonly cpu: number;
  readonly gpu: number | null;
  readonly memory: number;
  readonly disk: { readonly percent: number; readonly mount: string | null } | null;
  readonly download: number;
  readonly battery: number | null;
  readonly watts: number | null;
}

export function readingsOfSummary(summary: ComputerSummary): StripReadings {
  return {
    cpu: summary.cpuLoad,
    gpu: summary.gpuLoad,
    memory: summary.memoryPercent,
    disk: summary.fullestDisk,
    download: summary.downloadRate,
    battery: summary.batteryLevel,
    watts: summary.totalWatts,
  };
}

function numberOf(values: DeviceValues, metric: ComputerMetric): number | null {
  return headlineOf(values, metric)?.value ?? null;
}

export function readingsOfHeadlines(values: DeviceValues): StripReadings | undefined {
  const cpu = numberOf(values, 'cpu_load');
  const memory = numberOf(values, 'memory_used');
  if (cpu === null || memory === null) return undefined;
  const disk = numberOf(values, 'disk_used');
  return {
    cpu,
    gpu: numberOf(values, 'gpu_load'),
    memory,
    disk: disk === null ? null : { percent: disk, mount: null },
    download: numberOf(values, 'download_rate') ?? 0,
    battery: numberOf(values, 'battery_level'),
    watts: null,
  };
}

export interface StripInput {
  readonly readings: StripReadings | undefined;
  readonly series: StripSeries;
  readonly offline: boolean;
  readonly target: (page: string) => Href;
}

interface Tile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly page: string;
  readonly spark?: StripKey;
  readonly tone?: MetricItem['tone'];
  readonly caption?: string;
}

function itemOf(tile: Tile, input: StripInput): MetricItem {
  const spark =
    input.offline || tile.spark === undefined ? null : sparkOf(input.series[tile.spark]);
  return {
    key: tile.key,
    label: tile.label,
    value: tile.value,
    unit: tile.unit,
    href: input.target(tile.page),
    ...(input.offline ? { stale: true } : {}),
    ...(tile.tone === undefined ? {} : { tone: tile.tone }),
    ...(tile.caption === undefined ? {} : { caption: tile.caption }),
    ...(spark === null ? {} : { series: spark }),
  };
}

interface Percent {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly spark: StripKey;
  readonly page: string;
  readonly warns: boolean;
}

function percentTile({ key, label, value, spark, page, warns }: Percent): Tile {
  return {
    key,
    label,
    value: decimal(Math.round(value)),
    unit: '%',
    page,
    spark,
    ...(warns && value >= BUSY_PERCENT ? { tone: 'warning' as const } : {}),
  };
}

function diskTile(readings: StripReadings): readonly Tile[] {
  const fullestDisk = readings.disk;
  if (fullestDisk === null) return [];
  const severity = diskSeverity(fullestDisk.percent);
  const caption = [severity.word, fullestDisk.mount].filter((part) => part !== null).join(' · ');
  return [
    {
      key: 'disk',
      label: 'Disk',
      value: decimal(Math.round(fullestDisk.percent)),
      unit: '% full',
      page: 'storage',
      ...(caption === '' ? {} : { caption }),
      ...(severity.tone === null ? {} : { tone: severity.tone }),
    },
  ];
}

function powerTile(readings: StripReadings): readonly Tile[] {
  if (readings.battery !== null) {
    return [
      percentTile({
        key: 'battery',
        label: 'Battery',
        value: readings.battery,
        spark: 'summary/batteryLevel',
        page: 'system',
        warns: false,
      }),
    ];
  }
  if (readings.watts === null) return [];
  return [
    {
      key: 'power',
      label: 'Power',
      value: decimal(Math.round(readings.watts)),
      unit: 'W',
      page: 'system',
      spark: 'summary/totalWatts',
    },
  ];
}

function tilesOf(readings: StripReadings): readonly Tile[] {
  const rate = rateParts(readings.download);
  return [
    percentTile({
      key: 'cpu',
      label: 'CPU',
      value: readings.cpu,
      spark: 'summary/cpuLoad',
      page: 'performance',
      warns: true,
    }),
    ...(readings.gpu === null
      ? []
      : [
          percentTile({
            key: 'gpu',
            label: 'GPU',
            value: readings.gpu,
            spark: 'summary/gpuLoad',
            page: 'performance',
            warns: true,
          }),
        ]),
    percentTile({
      key: 'memory',
      label: 'Memory',
      value: readings.memory,
      spark: 'summary/memoryPercent',
      page: 'performance',
      warns: false,
    }),
    ...diskTile(readings),
    {
      key: 'network',
      label: 'Network',
      value: rate.value,
      unit: rate.unit,
      page: 'network',
      spark: 'summary/downloadRate',
    },
    ...powerTile(readings),
  ];
}

const WAITING: readonly MetricItem[] = ['CPU', 'Memory', 'Disk', 'Network'].map((label) => ({
  key: label,
  label,
  value: '--',
  stale: true,
}));

export function stripItems(input: StripInput): readonly MetricItem[] {
  const { readings } = input;
  if (readings === undefined) return WAITING;
  return tilesOf(readings).map((tile) => itemOf(tile, input));
}

const SIX_FROM = 1180;
const THREE_FROM = 600;

export function stripColumnsOf(area: number): number {
  if (area >= SIX_FROM) return 6;
  return area >= THREE_FROM ? 3 : 2;
}
