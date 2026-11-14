import type { SelectOption } from '../../../components/select-picker';
import type { RepeatMode } from './alarm-draft';

export const OFF = 'off';

const SMART_MINUTES = [10, 15, 20, 30, 45] as const;

const LEAD_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60] as const;

export const REPEAT_OPTIONS: readonly SelectOption<RepeatMode>[] = [
  { value: 'once', label: 'Once' },
  { value: 'every_day', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'custom', label: 'Custom days' },
];

function minuteOptions(
  presets: readonly number[],
  current: number | null,
  text: (minutes: number) => string,
): readonly SelectOption<string>[] {
  const minutes = current === null || presets.includes(current) ? presets : [...presets, current];
  return [...minutes]
    .sort((left, right) => left - right)
    .map((value) => ({ value: String(value), label: text(value) }));
}

export function smartText(minutes: number | null): string {
  return minutes === null ? 'Off' : `${String(minutes)} min`;
}

export function smartOptions(current: number | null): readonly SelectOption<string>[] {
  return [{ value: OFF, label: 'Off' }, ...minuteOptions(SMART_MINUTES, current, smartText)];
}

export function smartMinutesOf(value: string): number | null {
  return value === OFF ? null : Number(value);
}

export function leadText(minutes: number): string {
  return minutes === 0 ? 'At the alarm' : `${String(minutes)} min before`;
}

export function leadOptions(current: number | null): readonly SelectOption<string>[] {
  return minuteOptions(LEAD_MINUTES, current, leadText);
}
