import type { HealthRecord } from '@smarteverything/domain';
import { lowestOf, type TracePoint } from '../../../components/charts/night-trace-model';
import { decimal, signed, withUnit } from '../../../format/number';
import { clock } from '../../../format/time';
import type { SleepNight } from './sleep';
import { endOf, recordsOfType, startOf } from './records';

export const NIGHT_VITAL_TYPES = [
  'HeartRate',
  'OxygenSaturation',
  'SkinTemperature',
  'RespiratoryRate',
] as const;

const OXYGEN_FLOOR = 85;
const OXYGEN_CEILING = 100;
const OXYGEN_DIP_BELOW = 90;
const SKIN_RANGE = 1;

export type NightVitalKey = 'heart' | 'oxygen' | 'skin' | 'breathing';

export interface NightVital {
  readonly key: NightVitalKey;
  readonly title: string;
  readonly summary: string;
  readonly note: string | null;
  readonly points: readonly TracePoint[];
  readonly unit: string;
  readonly domain?: readonly [number, number];
  readonly guide?: number;
  readonly lowMark?: boolean;
  readonly ringBelow?: number;
  readonly dots?: boolean;
}

function pointsOf(records: readonly HealthRecord[], key: NightVitalKey): TracePoint[] {
  const points: Record<NightVitalKey, () => TracePoint[]> = {
    heart: () =>
      recordsOfType(records, 'HeartRate').flatMap((record) =>
        record.data.samples.map((sample) => ({ at: Date.parse(sample.time), value: sample.bpm })),
      ),
    oxygen: () =>
      recordsOfType(records, 'OxygenSaturation').map((record) => ({
        at: startOf(record),
        value: record.data.percent,
      })),
    skin: () =>
      recordsOfType(records, 'SkinTemperature').flatMap((record) =>
        record.data.deltas.map((delta) => ({ at: Date.parse(delta.time), value: delta.celsius })),
      ),
    breathing: () =>
      recordsOfType(records, 'RespiratoryRate').map((record) => ({
        at: startOf(record),
        value: record.data.rate,
      })),
  };
  return points[key]().sort((left, right) => left.at - right.at);
}

function within(points: readonly TracePoint[], from: number, to: number): TracePoint[] {
  return points.filter((point) => point.at >= from && point.at <= to);
}

function mean(points: readonly TracePoint[]): number {
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function heartOf(points: readonly TracePoint[], low: TracePoint): NightVital {
  return {
    key: 'heart',
    title: 'Heart rate',
    summary: `average ${withUnit(decimal(mean(points)), 'bpm')}`,
    note: `Lowest ${withUnit(decimal(low.value), 'bpm')} at ${clock(low.at)}`,
    points,
    unit: 'bpm',
    lowMark: true,
  };
}

function oxygenOf(points: readonly TracePoint[], low: TracePoint): NightVital {
  const dip = points.find((point) => point.value < OXYGEN_DIP_BELOW);
  return {
    key: 'oxygen',
    title: 'Blood oxygen',
    summary: `average ${decimal(mean(points))}% · lowest ${decimal(low.value)}%`,
    note: dip === undefined ? null : `Under ${String(OXYGEN_DIP_BELOW)}% at ${clock(dip.at)}`,
    points,
    unit: '%',
    domain: [Math.min(OXYGEN_FLOOR, Math.floor(low.value)), OXYGEN_CEILING],
    guide: OXYGEN_DIP_BELOW,
    ringBelow: OXYGEN_DIP_BELOW,
    dots: true,
  };
}

function skinOf(points: readonly TracePoint[]): NightVital {
  const values = points.map((point) => point.value);
  const reach = Math.max(SKIN_RANGE, ...values.map(Math.abs));
  return {
    key: 'skin',
    title: 'Skin temperature',
    summary: `${signed(mean(points), 1)} °C vs usual`,
    note: 'Change from your baseline',
    points,
    unit: '°C',
    domain: [-Math.ceil(reach), Math.ceil(reach)],
    guide: 0,
  };
}

function breathingOf(points: readonly TracePoint[]): NightVital {
  return {
    key: 'breathing',
    title: 'Breathing rate',
    summary: `${decimal(mean(points))} per minute`,
    note: null,
    points,
    unit: '',
  };
}

const BUILDERS: Readonly<
  Record<NightVitalKey, (points: readonly TracePoint[], low: TracePoint) => NightVital>
> = {
  heart: heartOf,
  oxygen: oxygenOf,
  skin: skinOf,
  breathing: breathingOf,
};

const ORDER: readonly NightVitalKey[] = ['heart', 'oxygen', 'skin', 'breathing'];

export function vitalsOf(records: readonly HealthRecord[], night: SleepNight): NightVital[] {
  const asleep = records.filter((record) => endOf(record) >= night.bedtime);
  return ORDER.flatMap((key) => {
    const points = within(pointsOf(asleep, key), night.bedtime, night.wake);
    const low = lowestOf(points);
    return low === null ? [] : [BUILDERS[key](points, low)];
  });
}
