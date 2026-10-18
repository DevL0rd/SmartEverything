import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { minuteOfClock, type SunEvent } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { TimeField } from '../../../components/time-field';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { clockOfMinutes } from '../../../format/time';
import { WEEKDAY_SHORT, WEEK_ORDER, offsetText, weekdaysText } from '../model/time-text';

export function ClockField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (clock: string) => void;
}): ReactNode {
  const minute = minuteOfClock(value);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <TimeField
        label={label}
        value={{ hour: Math.floor(minute / 60), minute: minute % 60 }}
        onChange={(time) => {
          onChange(clockOfMinutes(time.hour * 60 + time.minute));
        }}
      />
    </View>
  );
}

function DayToggle({
  day,
  selected,
  onToggle,
}: {
  readonly day: (typeof WEEK_ORDER)[number];
  readonly selected: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Interactive
      label={WEEKDAY_SHORT[day]}
      role="checkbox"
      selected={selected}
      onPress={() => {
        selectionTick();
        onToggle();
      }}
      className="h-touch-min max-w-14 flex-1 items-center justify-center"
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'size-10 items-center justify-center rounded-full',
          selected ? 'bg-primary' : 'border border-outline bg-surface-2',
        )}
      >
        <Text variant="label" tone={selected ? 'onPrimary' : 'default'}>
          {WEEKDAY_SHORT[day].charAt(0)}
        </Text>
      </View>
    </Interactive>
  );
}

export function WeekdayToggles({
  value,
  onChange,
}: {
  readonly value: readonly number[];
  readonly onChange: (days: number[]) => void;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {`Days · ${weekdaysText(value)}`}
      </Text>
      <View accessibilityLabel="Days of the week" className="flex-row">
        {WEEK_ORDER.map((day) => (
          <DayToggle
            key={day}
            day={day}
            selected={value.includes(day)}
            onToggle={() => {
              onChange(
                value.includes(day) ? value.filter((chosen) => chosen !== day) : [...value, day],
              );
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function SunField({
  event,
  offsetMinutes,
  onChange,
}: {
  readonly event: SunEvent;
  readonly offsetMinutes: number;
  readonly onChange: (event: SunEvent, offsetMinutes: number) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Segmented
        label="Sun event"
        value={event}
        options={[
          { value: 'sunrise', label: 'Sunrise', icon: 'sunrise' },
          { value: 'sunset', label: 'Sunset', icon: 'sunset' },
        ]}
        onChange={(next) => {
          onChange(next, offsetMinutes);
        }}
      />
      <NumberStepper
        label="Offset"
        value={offsetMinutes}
        min={-720}
        max={720}
        step={5}
        formatValue={(minutes) => offsetText(event, minutes)}
        onChange={(next) => {
          onChange(event, next);
        }}
      />
    </View>
  );
}

interface DurationUnit {
  readonly value: string;
  readonly label: string;
  readonly size: number;
}

export type DurationUnits = readonly [DurationUnit, ...DurationUnit[]];

function unitFor(units: DurationUnits, amount: number): DurationUnit {
  return [...units].reverse().find((unit) => amount % unit.size === 0) ?? units[0];
}

function unitNamed(units: DurationUnits, name: string): DurationUnit {
  return units.find((unit) => unit.value === name) ?? units[0];
}

export interface DurationProps {
  readonly label: string;
  readonly value: number;
  readonly units: DurationUnits;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly hideLabel?: boolean;
}

export function DurationField({
  label,
  value,
  units,
  max,
  onChange,
  hideLabel = false,
}: DurationProps): ReactNode {
  const [chosen, setChosen] = useState(() => unitFor(units, value).value);
  const unit = unitNamed(units, chosen);
  const amount = Math.max(1, Math.round(value / unit.size));
  return (
    <View className="gap-1">
      {hideLabel ? null : (
        <Text variant="footnote" tone="variant">
          {label}
        </Text>
      )}
      <View className="gap-3">
        <NumberStepper
          label={label}
          value={amount}
          min={1}
          max={Math.floor(max / unit.size)}
          step={1}
          unit={unit.label}
          onChange={(next) => {
            onChange(next * unit.size);
          }}
        />
        <Segmented
          label={`${label} unit`}
          value={chosen}
          options={units.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(next) => {
            setChosen(next);
            const size = unitNamed(units, next).size;
            onChange(Math.min(max, Math.max(1, Math.round(value / size)) * size));
          }}
        />
      </View>
    </View>
  );
}
