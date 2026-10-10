import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DateNav } from '../../components/date-nav';
import { NumberStepper } from '../../components/number-stepper';
import { Select } from '../../components/select';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { TimeField, type TimeOfDay } from '../../components/time-field';
import type { LogTime, LogValue, LogValues } from './form-values';
import type { LogField, LogForm } from './forms';

const DAY_MINUTES = 1440;

function FieldInput({
  field,
  value,
  onChange,
}: {
  readonly field: LogField;
  readonly value: LogValue;
  readonly onChange: (value: LogValue) => void;
}): ReactNode {
  if (field.kind === 'text') {
    return (
      <TextField
        label={field.label}
        value={String(value)}
        onChange={onChange}
        multiline={field.key === 'notes'}
      />
    );
  }
  if (field.kind === 'choice') {
    return (
      <Select<string>
        label={field.label}
        options={field.options.map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        value={String(value)}
        onChange={(chosen) => {
          onChange(Number(chosen));
        }}
        showLabel
      />
    );
  }
  return (
    <Labelled label={field.label}>
      <NumberStepper
        label={field.label}
        value={Number(value)}
        min={field.min}
        max={field.max}
        step={field.step}
        unit={field.unit}
        onChange={onChange}
      />
    </Labelled>
  );
}

function Labelled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-2">
      <Text variant="callout" tone="variant">
        {label}
      </Text>
      {children}
    </View>
  );
}

export function LogFields({
  form,
  values,
  onChange,
}: {
  readonly form: LogForm;
  readonly values: LogValues;
  readonly onChange: (values: LogValues) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      {form.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          onChange={(value) => {
            onChange({ ...values, [field.key]: value });
          }}
        />
      ))}
    </View>
  );
}

function withDate(start: number, date: Date): number {
  const next = new Date(date);
  const before = new Date(start);
  next.setHours(before.getHours(), before.getMinutes(), 0, 0);
  return next.getTime();
}

function withTime(start: number, time: TimeOfDay): number {
  const next = new Date(start);
  next.setHours(time.hour, time.minute, 0, 0);
  return next.getTime();
}

function Length({
  form,
  time,
  onChange,
}: {
  readonly form: LogForm;
  readonly time: LogTime;
  readonly onChange: (time: LogTime) => void;
}): ReactNode {
  if ((form.minutes ?? 0) >= DAY_MINUTES) {
    return (
      <Labelled label="Days">
        <NumberStepper
          label="Days"
          value={Math.max(1, Math.round(time.minutes / DAY_MINUTES))}
          min={1}
          max={14}
          step={1}
          unit="days"
          onChange={(days) => {
            onChange({ ...time, minutes: days * DAY_MINUTES });
          }}
        />
      </Labelled>
    );
  }
  return (
    <Labelled label="Duration">
      <NumberStepper
        label="Duration"
        value={time.minutes}
        min={5}
        max={DAY_MINUTES}
        step={form.timing === 'span' ? 15 : 5}
        unit="min"
        onChange={(minutes) => {
          onChange({ ...time, minutes });
        }}
      />
    </Labelled>
  );
}

export function LogTimeFields({
  form,
  time,
  onChange,
}: {
  readonly form: LogForm;
  readonly time: LogTime;
  readonly onChange: (time: LogTime) => void;
}): ReactNode {
  const start = new Date(time.start);
  return (
    <View className="gap-4">
      <Text variant="title-3">When</Text>
      <DateNav
        value={start}
        range="day"
        max={new Date()}
        onChange={(date) => {
          onChange({ ...time, start: withDate(time.start, date) });
        }}
      />
      <TimeField
        label={form.timing === 'instant' ? 'Time' : 'Started'}
        value={{ hour: start.getHours(), minute: start.getMinutes() }}
        onChange={(value) => {
          onChange({ ...time, start: withTime(time.start, value) });
        }}
      />
      {form.timing === 'instant' ? null : <Length form={form} time={time} onChange={onChange} />}
    </View>
  );
}
