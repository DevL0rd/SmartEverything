import { formatByteRate } from '@smarteverything/domain';
import type { YDomain } from '../../../components/charts';
import { decimal } from '../../../format/number';
import type { LiveLine } from '../components/live-series-chart';

export const PERCENT_DOMAIN: YDomain = [0, 100];

export function whole(value: number): string {
  return decimal(Math.round(value));
}

export function byteRate(value: number): string {
  return formatByteRate(value);
}

export type OverviewChart = 'cpu' | 'gpu' | 'net' | 'disk';

export interface ChartKind {
  readonly title: string;
  readonly short: string;
  readonly label: string;
  readonly yDomain: YDomain;
  readonly unit: string | undefined;
  readonly format: (value: number) => string;
  readonly topics: readonly ('summary' | 'disks')[];
}

export const CPU_LINES: readonly LiveLine[] = [
  { ids: ['summary/cpuLoad'], label: 'CPU', colour: 'viz-blue' },
];

export const GPU_LINES: readonly LiveLine[] = [
  { ids: ['summary/gpuLoad'], label: 'Load', colour: 'viz-blue' },
  { ids: ['summary/gpuMemoryPercent'], label: 'Video memory', colour: 'viz-magenta' },
];

export const NET_LINES: readonly LiveLine[] = [
  { ids: ['summary/downloadRate'], label: 'Download', colour: 'viz-blue' },
  { ids: ['summary/uploadRate'], label: 'Upload', colour: 'viz-magenta' },
];

export function diskLines(devices: readonly string[]): readonly LiveLine[] {
  return [
    {
      ids: devices.map((device) => `disks/${device}.readRate`),
      combine: 'sum',
      label: 'Read',
      colour: 'viz-blue',
    },
    {
      ids: devices.map((device) => `disks/${device}.writeRate`),
      combine: 'sum',
      label: 'Write',
      colour: 'viz-magenta',
    },
  ];
}

export const CHART_KINDS: Readonly<Record<OverviewChart, ChartKind>> = {
  cpu: {
    title: 'CPU',
    short: 'CPU',
    label: 'CPU chart',
    yDomain: PERCENT_DOMAIN,
    unit: '%',
    format: whole,
    topics: ['summary'],
  },
  gpu: {
    title: 'GPU',
    short: 'GPU',
    label: 'GPU chart',
    yDomain: PERCENT_DOMAIN,
    unit: '%',
    format: whole,
    topics: ['summary'],
  },
  net: {
    title: 'Network',
    short: 'Net',
    label: 'Network chart',
    yDomain: 'sticky',
    unit: undefined,
    format: byteRate,
    topics: ['summary'],
  },
  disk: {
    title: 'Disk activity',
    short: 'Disk',
    label: 'Disk chart',
    yDomain: 'sticky',
    unit: undefined,
    format: byteRate,
    topics: ['disks'],
  },
};
