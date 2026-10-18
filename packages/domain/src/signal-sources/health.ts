import { HEALTH_METRICS, HEALTH_METRIC_UNITS } from '../api/rows-access';
import { LOGGABLE_TYPES } from '../health-entries';
import { humanizeKey } from '../presentation/humanize';
import type { SignalFieldSpec, SignalSourceSpec } from './spec';

const COUNT_UNIT = 'count';

export const BODY_READING_FIELDS: readonly SignalFieldSpec[] = [
  { field: 'weight_kg', label: 'Weight', unit: 'kg' },
  { field: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { field: 'bmi', label: 'BMI', unit: null },
];

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
        label: humanizeKey(metric),
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
        label: humanizeKey(type),
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
