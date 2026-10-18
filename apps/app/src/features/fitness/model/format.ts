import { HC_CODES, hcLabel, type HealthRecord } from '@smarteverything/domain';
import { hoursMinutes } from '../../../format/time';
import type { Trend } from './aggregate';
import { formatReading, seriesOfType } from './catalogue';
import { exerciseKindOf } from '../../health-log';
import type { Point } from './readers';
import { isOccurrence, type SeriesSpec } from './series-spec';
import { count, signed, withUnit } from '../../../format/number';

function categorical(record: HealthRecord): string | null {
  if (record.type === 'MenstruationFlow') {
    return hcLabel(HC_CODES.flow, record.data.flow);
  }
  if (record.type === 'OvulationTest') {
    return hcLabel(HC_CODES.ovulationResult, record.data.result);
  }
  if (record.type === 'CervicalMucus') {
    return hcLabel(HC_CODES.mucusAppearance, record.data.appearance);
  }
  if (record.type === 'SexualActivity') {
    return hcLabel(HC_CODES.protection, record.data.protectionUsed);
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
  if (spec.read === 'pair') {
    return withUnit(`${count(first.value)}/${count(first.low)}`, spec.unit);
  }
  if (spec.read === 'samples') {
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
  const points = spec.pointsOf(record);
  const label = categorical(record);
  const first = points[0];
  if (first === undefined || isOccurrence(spec)) {
    return label ?? spec.label;
  }
  if (spec.read === 'duration') {
    return joined(label, hoursMinutes(first.value));
  }
  return joined(label, measured(spec, points, first));
}

export function trendWords(spec: SeriesSpec, trend: Trend | null, showUnit: boolean): string {
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
  const amount = withUnit(change, showUnit ? spec.unit : '');
  return trend.percent === null
    ? `${arrow} ${amount}`
    : `${arrow} ${amount} (${signed(trend.percent, 0)}%)`;
}
