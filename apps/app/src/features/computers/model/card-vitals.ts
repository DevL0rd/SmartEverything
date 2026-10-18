import type { ComputerSummary } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import type { DeviceValues } from '../../../store/state';
import { decimal } from '../../../format/number';
import { headlineOf } from './computer-headlines';

export interface Vitals {
  readonly cpu: number;
  readonly cpuTemperature: number | null;
  readonly gpu: number | null;
  readonly gpuTemperature: number | null;
  readonly ram: number;
}

export type VitalKey = 'cpu' | 'gpu' | 'ram';

export interface VitalLine {
  readonly key: VitalKey;
  readonly level: Level;
  readonly text: string;
  readonly spoken: string;
}

function whole(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

export function vitalsOfSummary(summary: ComputerSummary | undefined): Vitals | null {
  if (summary === undefined) return null;
  return {
    cpu: Math.round(summary.cpuLoad),
    cpuTemperature: whole(summary.cpuTemperature),
    gpu: whole(summary.gpuLoad),
    gpuTemperature: whole(summary.gpuTemperature),
    ram: Math.round(summary.memoryPercent),
  };
}

export function vitalsOfHeadlines(values: DeviceValues): Vitals | null {
  const cpu = headlineOf(values, 'cpu_load');
  const ram = headlineOf(values, 'memory_used');
  if (cpu === null || ram === null) return null;
  return {
    cpu: Math.round(cpu.value),
    cpuTemperature: whole(headlineOf(values, 'cpu_temperature')?.value ?? null),
    gpu: whole(headlineOf(values, 'gpu_load')?.value ?? null),
    gpuTemperature: whole(headlineOf(values, 'gpu_temperature')?.value ?? null),
    ram: Math.round(ram.value),
  };
}

export type Level = 'normal' | 'warm' | 'hot';

const WARM_FROM = 75;
const HOT_FROM = 90;

export function levelOf(value: number): Level {
  if (value >= HOT_FROM) return 'hot';
  return value >= WARM_FROM ? 'warm' : 'normal';
}

export function spokenVital(label: string, load: number, temperature: number | null): string {
  const spoken = `${label} ${decimal(load)} percent`;
  return temperature === null ? spoken : `${spoken}, ${decimal(temperature)} degrees`;
}

function lineOf(key: VitalKey, label: string, load: number, temperature: number | null): VitalLine {
  const text = `${label} ${decimal(load)} %`;
  const spoken = spokenVital(label, load, temperature);
  const level = levelOf(Math.max(load, temperature ?? 0));
  return temperature === null
    ? { key, level, text, spoken }
    : { key, level, text: `${text} · ${decimal(temperature)} °C`, spoken };
}

export function vitalLines(vitals: Vitals): readonly VitalLine[] {
  return [
    lineOf('cpu', 'CPU', vitals.cpu, vitals.cpuTemperature),
    ...(vitals.gpu === null ? [] : [lineOf('gpu', 'GPU', vitals.gpu, vitals.gpuTemperature)]),
    lineOf('ram', 'RAM', vitals.ram, null),
  ];
}

export interface VitalSpec {
  readonly key: VitalKey;
  readonly label: string;
  readonly seriesId: string;
  readonly colour: ColourRole;
  readonly load: (vitals: Vitals) => number | null;
  readonly temperature: (vitals: Vitals) => number | null;
}

const VITAL_SPECS: readonly VitalSpec[] = [
  {
    key: 'cpu',
    label: 'CPU',
    seriesId: 'summary/cpuLoad',
    colour: 'viz-blue',
    load: (vitals) => vitals.cpu,
    temperature: (vitals) => vitals.cpuTemperature,
  },
  {
    key: 'gpu',
    label: 'GPU',
    seriesId: 'summary/gpuLoad',
    colour: 'viz-magenta',
    load: (vitals) => vitals.gpu,
    temperature: (vitals) => vitals.gpuTemperature,
  },
  {
    key: 'ram',
    label: 'RAM',
    seriesId: 'summary/memoryPercent',
    colour: 'viz-violet',
    load: (vitals) => vitals.ram,
    temperature: () => null,
  },
];

export function specsOf(vitals: Vitals): readonly VitalSpec[] {
  return VITAL_SPECS.filter((spec) => spec.load(vitals) !== null);
}

export function bucketLoads(values: readonly number[], most: number): readonly number[] {
  if (values.length <= most) return values;
  const size = Math.ceil(values.length / most);
  return Array.from({ length: Math.ceil(values.length / size) }, (_, bucket) => {
    const group = values.slice(bucket * size, (bucket + 1) * size);
    return group.reduce((sum, load) => sum + load, 0) / group.length;
  });
}
