import { HOUR_MS, MINUTE_MS } from '../../../format/time';
import type { DurationUnits } from './time-fields';

export const MILLISECOND_UNITS: DurationUnits = [
  { value: 'milliseconds', label: 'ms', size: 1 },
  { value: 'seconds', label: 's', size: 1000 },
  { value: 'minutes', label: 'min', size: MINUTE_MS },
  { value: 'hours', label: 'h', size: HOUR_MS },
];

export const SECOND_UNITS: DurationUnits = [
  { value: 'seconds', label: 's', size: 1 },
  { value: 'minutes', label: 'min', size: 60 },
  { value: 'hours', label: 'h', size: 3600 },
];

export const MINUTE_UNITS: DurationUnits = [
  { value: 'minutes', label: 'min', size: 1 },
  { value: 'hours', label: 'h', size: 60 },
  { value: 'days', label: 'd', size: 1440 },
];
