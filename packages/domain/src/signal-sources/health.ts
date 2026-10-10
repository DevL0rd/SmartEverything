import { HEALTH_METRICS, HEALTH_METRIC_UNITS } from '../api/rows-access';
import { LOGGABLE_TYPES } from '../health-entries';
import type { SignalFieldSpec, SignalSourceSpec } from './spec';

const COUNT_UNIT = 'count';

export const BODY_READING_FIELDS: readonly SignalFieldSpec[] = [
  { field: 'weight_kg', label: 'Weight', unit: 'kg' },
  { field: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { field: 'bmi', label: 'BMI', unit: null },
];

function sentenceOf(words: readonly string[]): string {
  const text = words.join(' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function metricLabel(metric: string): string {
  return sentenceOf(metric.split('_'));
}

export function loggedTypeLabel(type: string): string {
  return sentenceOf(type.split(/(?=[A-Z])/));
}

export const HEALTH_SIGNALS: SignalSourceSpec = {
  source: 'health',
  label: 'Health',
  kinds: [
    {
      kind: 'today',
      label: 'A total for today changes',
      subject: 'profile',
      fields: HEALTH_METRICS.map((metric) => ({
        field: metric,
        label: metricLabel(metric),
        unit: HEALTH_METRIC_UNITS[metric] === COUNT_UNIT ? null : HEALTH_METRIC_UNITS[metric],
      })),
      match: [],
      pulse: false,
    },
    {
      kind: 'logged',
      label: 'Something is logged',
      subject: 'profile',
      fields: LOGGABLE_TYPES.map((type) => ({
        field: type,
        label: loggedTypeLabel(type),
        unit: null,
      })),
      match: [],
      pulse: true,
    },
    {
      kind: 'body_reading',
      label: 'A scale reading arrives',
      subject: 'profile',
      fields: BODY_READING_FIELDS,
      match: [{ key: 'deviceId', label: 'The scale', values: null }],
      pulse: false,
    },
    {
      kind: 'sleep_ended',
      label: 'Sleep ends (woke up)',
      subject: 'profile',
      fields: [],
      match: [],
      pulse: true,
    },
  ],
};
