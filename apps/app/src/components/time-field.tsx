import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '../design/cn';
import { selectionTick } from '../platform/haptics';
import { IconButton } from './icon-button';
import { Segmented } from './segmented';
import { Text } from './text';
import { twoDigits } from '../format/number';
import { committedValue, digitsDraft, settledValue } from './number-draft';

export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

export interface TimeFieldProps {
  readonly value: TimeOfDay;
  readonly onChange: (value: TimeOfDay) => void;
  readonly label: string;
  readonly hour24: boolean;
}

export type Period = 'am' | 'pm';

class DayPeriodError extends Error {
  override readonly name = 'DayPeriodError';

  constructor(readonly hour: number) {
    super(`The locale's 12-hour clock gave no day period for hour ${String(hour)}.`);
  }
}

const PERIOD_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true });

const PERIOD_LABELS = new Map<number, string>();

function periodLabel(hour: number): string {
  const known = PERIOD_LABELS.get(hour);
  if (known !== undefined) {
    return known;
  }
  const part = PERIOD_FORMAT.formatToParts(new Date(2000, 0, 1, hour)).find(
    (entry) => entry.type === 'dayPeriod',
  );
  if (part === undefined) {
    throw new DayPeriodError(hour);
  }
  PERIOD_LABELS.set(hour, part.value);
  return part.value;
}

function wrapped(value: number, min: number, max: number): number {
  const span = max - min + 1;
  return ((((value - min) % span) + span) % span) + min;
}

export function periodOf(hour: number): Period {
  return hour < 12 ? 'am' : 'pm';
}

export function shownHourOf(hour: number, hour12: boolean): number {
  return hour12 ? wrapped(hour, 1, 12) : hour;
}

export function hourOfShown(shown: number, period: Period, hour12: boolean): number {
  if (!hour12) return shown;
  return (shown % 12) + (period === 'pm' ? 12 : 0);
}

export function hourInPeriod(hour: number, period: Period): number {
  return (hour % 12) + (period === 'pm' ? 12 : 0);
}

interface PartProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly onChange: (value: number) => void;
}

interface PartDraft {
  readonly draft: string | null;
  readonly invalid: boolean;
  readonly type: (text: string) => void;
  readonly settle: () => void;
}

function usePartDraft(min: number, max: number, onChange: (value: number) => void): PartDraft {
  const [draft, setDraft] = useState<string | null>(null);
  const range = { min, max };
  const invalid = draft !== null && draft !== '' && committedValue(draft, range) === null;
  const type = (text: string): void => {
    const digits = digitsDraft(text);
    setDraft(digits);
    const next = committedValue(digits, range);
    if (next !== null) {
      onChange(next);
    }
  };
  const settle = (): void => {
    const next = draft === null ? null : settledValue(draft, range);
    setDraft(null);
    if (next !== null) {
      onChange(next);
    }
  };
  return { draft, invalid, type, settle };
}

function TimePart({ value, min, max, label, onChange }: PartProps): ReactNode {
  const { draft, invalid, type, settle } = usePartDraft(min, max, onChange);
  const step = (by: number): void => {
    selectionTick();
    onChange(wrapped(value + by, min, max));
  };
  return (
    <View className="items-center">
      <IconButton
        icon="chevronUp"
        label={`Increase ${label}`}
        onPress={() => {
          step(1);
        }}
      />
      <TextInput
        value={draft ?? twoDigits(value)}
        onChangeText={type}
        onBlur={settle}
        keyboardType="number-pad"
        maxLength={2}
        accessibilityLabel={label}
        className={cn(
          'h-control-h w-16 rounded-md border bg-surface-2 text-center font-sans-medium text-title-2 text-on-surface tabular focus:outline-2 focus:outline-focus',
          invalid ? 'border-critical' : 'border-outline',
        )}
      />
      <IconButton
        icon="chevronDown"
        label={`Decrease ${label}`}
        onPress={() => {
          step(-1);
        }}
      />
    </View>
  );
}

function PeriodToggle({
  period,
  label,
  onChange,
}: {
  readonly period: Period;
  readonly label: string;
  readonly onChange: (period: Period) => void;
}): ReactNode {
  const options = [
    { value: 'am', label: periodLabel(0) },
    { value: 'pm', label: periodLabel(12) },
  ] as const;
  return <Segmented options={options} value={period} onChange={onChange} label={label} />;
}

export function TimeField({ value, onChange, label, hour24 }: TimeFieldProps): ReactNode {
  const hour12 = !hour24;
  const period = periodOf(value.hour);
  const setHour = (hour: number): void => {
    onChange({ hour: hourOfShown(hour, period, hour12), minute: value.minute });
  };
  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={label}
      className="flex-row items-center gap-2"
    >
      <TimePart
        value={shownHourOf(value.hour, hour12)}
        min={hour12 ? 1 : 0}
        max={hour12 ? 12 : 23}
        label={`${label} hour`}
        onChange={setHour}
      />
      <Text variant="title-2" tone="variant">
        :
      </Text>
      <TimePart
        value={value.minute}
        min={0}
        max={59}
        label={`${label} minute`}
        onChange={(minute) => {
          onChange({ hour: value.hour, minute });
        }}
      />
      {hour12 ? (
        <View>
          <PeriodToggle
            period={period}
            label={`${label} AM or PM`}
            onChange={(next) => {
              onChange({ hour: hourInPeriod(value.hour, next), minute: value.minute });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
