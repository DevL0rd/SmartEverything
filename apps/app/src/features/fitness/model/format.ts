import type { HealthRecord } from '@smarteverything/domain';
import { hoursMinutes } from '../../../format/time';
import type { Trend } from './aggregate';
import { formatReading, seriesOfType } from './catalogue';
import { exerciseKindOf } from '../../health-log';
import { pointsOfRecord, type Point } from './points';
import type { SeriesSpec } from './series-spec';
import { count, signed } from '../../../format/number';

const FLOW = ['Unknown flow', 'Light flow', 'Medium flow', 'Heavy flow'];
const OVULATION = ['Inconclusive', 'Positive', 'High', 'Negative'];
const MUCUS = ['Unknown', 'Dry', 'Sticky', 'Creamy', 'Watery', 'Egg white', 'Unusual'];
const PROTECTION = ['Protection not recorded', 'Protected', 'Unprotected'];

function labelOf(labels: readonly string[], code: number): string {
  return labels[code] ?? `Code ${String(code)}`;
}

function categorical(record: HealthRecord): string | null {
  if (record.type === 'MenstruationFlow') {
    return labelOf(FLOW, record.data.flow);
  }
  if (record.type === 'OvulationTest') {
    return labelOf(OVULATION, record.data.result);
  }
  if (record.type === 'CervicalMucus') {
    return labelOf(MUCUS, record.data.appearance);
  }
  if (record.type === 'SexualActivity') {
    return labelOf(PROTECTION, record.data.protectionUsed);
  }
  if (record.type === 'MindfulnessSession' || record.type === 'Nutrition') {
    return record.type === 'Nutrition' ? record.data.name : record.data.title;
  }
  if (record.type === 'PlannedExerciseSession') {
    return record.data.title ?? exerciseKindOf(record.data.exerciseType).name;
  }
  return null;
}

function measured(spec: SeriesSpec, points: readonly Point[], first: Point): string {
  if (spec.read.kind === 'field' && spec.read.second !== undefined) {
    return `${count(first.value)}/${count(first.low)} ${spec.unit}`;
  }
  if (spec.read.kind === 'samples') {
    const mean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
    return `${formatReading(spec, mean)} · ${String(points.length)} samples`;
  }
  return formatReading(spec, first.value);
}

function joined(label: string | null, shown: string): string {
  return label === null ? shown : `${label} · ${shown}`;
}

export function recordSummary(record: HealthRecord): string {
  const spec = seriesOfType(record.type);
  const points = pointsOfRecord(spec, record);
  const label = categorical(record);
  const first = points[0];
  if (first === undefined || spec.read.kind === 'occurrence') {
    return label ?? spec.label;
  }
  if (spec.read.kind === 'duration') {
    return joined(label, hoursMinutes(first.value));
  }
  return joined(label, measured(spec, points, first));
}

export function trendWords(spec: SeriesSpec, trend: Trend | null, withUnit: boolean): string {
  if (trend === null) {
    return 'no earlier data';
  }
  if (trend.direction === 'flat') {
    return '→ steady';
  }
  const change = signed(trend.delta * spec.scale, spec.digits);
  if (change === '±0') {
    return '→ steady';
  }
  const arrow = trend.direction === 'up' ? '↑' : '↓';
  const unit = withUnit && spec.unit !== '' ? ` ${spec.unit}` : '';
  const amount = `${change}${unit}`;
  return trend.percent === null
    ? `${arrow} ${amount}`
    : `${arrow} ${amount} (${signed(trend.percent, 0)}%)`;
}
