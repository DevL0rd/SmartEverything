import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '../design/cn';
import { selectionTick } from '../platform/haptics';
import { IconButton } from './icon-button';
import { Segmented } from './segmented';
import { Text } from './text';
import { twoDigits } from '../format/number';

export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

export interface TimeFieldProps {
  readonly value: TimeOfDay;
  readonly onChange: (value: TimeOfDay) => void;
  readonly label: string;
  readonly hour12?: boolean;
}

type Period = 'am' | 'pm';

class DayPeriodError extends Error {
  override readonly name = 'DayPeriodError';

  constructor(readonly hour: number) {
    super(`The locale's 12-hour clock gave no day period for hour ${String(hour)}.`);
  }
}

export function localeUsesHour12(): boolean {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true;
}

function periodLabel(hour: number): string {
  const part = new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true })
    .formatToParts(new Date(2000, 0, 1, hour))
    .find((entry) => entry.type === 'dayPeriod');
  if (part === undefined) {
    throw new DayPeriodError(hour);
  }
  return part.value;
}

function wrapped(value: number, min: number, max: number): number {
  const span = max - min + 1;
  return ((((value - min) % span) + span) % span) + min;
}

function accepts(digits: string, min: number, max: number): boolean {
  const typed = Number(digits);
  return digits !== '' && typed >= min && typed <= max;
}

interface PartProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly onChange: (value: number) => void;
}

function TimePart({ value, min, max, label, onChange }: PartProps): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && !accepts(draft, min, max);
  const step = (by: number): void => {
    selectionTick();
    onChange(wrapped(value + by, min, max));
  };
  const type = (text: string): void => {
    const digits = text.replace(/\D/g, '').slice(0, 2);
    setDraft(digits);
    if (accepts(digits, min, max)) {
      onChange(Number(digits));
    }
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
        onBlur={() => {
          setDraft(null);
        }}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
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

export function TimeField({
  value,
  onChange,
  label,
  hour12 = localeUsesHour12(),
}: TimeFieldProps): ReactNode {
  const period: Period = value.hour < 12 ? 'am' : 'pm';
  const offset = period === 'pm' ? 12 : 0;
  const shownHour = hour12 ? wrapped(value.hour, 1, 12) : value.hour;
  const setHour = (hour: number): void => {
    onChange({ hour: hour12 ? (hour % 12) + offset : hour, minute: value.minute });
  };
  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={label}
      className="flex-row items-center gap-2"
    >
      <TimePart
        value={shownHour}
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
        <PeriodToggle
          period={period}
          label={`${label} AM or PM`}
          onChange={(next) => {
            onChange({ hour: (value.hour % 12) + (next === 'pm' ? 12 : 0), minute: value.minute });
          }}
        />
      ) : null}
    </View>
  );
}
