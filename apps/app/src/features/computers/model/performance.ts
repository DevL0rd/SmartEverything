import type { MetricRange, SensorSnapshot } from '@smarteverything/domain';
import { WARM_CELSIUS } from './computer-view';

export type StoredRange = MetricRange;

export type ViewRange = 'live' | StoredRange;

export const RANGE_OPTIONS: readonly { readonly value: ViewRange; readonly label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: '10m', label: '10 min' },
  { value: '24h', label: '24 h' },
  { value: '30d', label: '30 days' },
];

export const RANGE_SPAN_MS: Readonly<Record<StoredRange, number>> = {
  '10m': 600_000,
  '24h': 86_400_000,
  '30d': 2_592_000_000,
};

export type SensorGroup = 'Processor' | 'Graphics' | 'Drives' | 'Memory' | 'Board';

const SENSOR_GROUPS: readonly SensorGroup[] = [
  'Processor',
  'Graphics',
  'Drives',
  'Memory',
  'Board',
];

const CHIP_GROUPS: readonly (readonly [RegExp, SensorGroup])[] = [
  [/^(coretemp|k10temp|zenpower|cpu)/i, 'Processor'],
  [/^(amdgpu|nouveau|nvidia|i915|xe|radeon|gpu)/i, 'Graphics'],
  [/^(nvme|drivetemp|sd|ata)/i, 'Drives'],
  [/^(spd|jc42|dimm|ddr)/i, 'Memory'],
];

export function groupOf(sensor: Pick<SensorSnapshot, 'chip'>): SensorGroup {
  return CHIP_GROUPS.find(([pattern]) => pattern.test(sensor.chip))?.[1] ?? 'Board';
}

export function sensorWord(sensor: SensorSnapshot): 'Critical' | 'Hot' | null {
  if (sensor.criticalCelsius !== null && sensor.celsius >= sensor.criticalCelsius)
    return 'Critical';
  const high = sensor.highCelsius ?? WARM_CELSIUS;
  return sensor.celsius >= high ? 'Hot' : null;
}

export function sensorsByGroup(
  sensors: readonly SensorSnapshot[],
): readonly { readonly group: SensorGroup; readonly rows: readonly SensorSnapshot[] }[] {
  return SENSOR_GROUPS.map((group) => ({
    group,
    rows: sensors.filter((sensor) => groupOf(sensor) === group),
  })).filter((entry) => entry.rows.length > 0);
}
