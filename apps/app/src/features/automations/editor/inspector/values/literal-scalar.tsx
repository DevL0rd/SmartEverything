import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Segmented } from '../../../../../components/segmented';
import { Select } from '../../../../../components/select';
import { TextField } from '../../../../../components/text-field';
import type { FieldControl } from '../schema-fields';
import { DurationRow } from '../sections/duration-row';
import { numberBounds } from './literal-model';

export interface LiteralProps<C extends FieldControl> {
  readonly control: C;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
}

export function FlagLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<FieldControl>): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Segmented
        label={label}
        disabled={disabled}
        value={value === true ? 'on' : 'off'}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        onChange={(next) => {
          onChange(next === 'on');
        }}
      />
    </View>
  );
}

export function NumberLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<Extract<FieldControl, { t: 'number' }>>): ReactNode {
  const { min, max } = numberBounds(control);
  return (
    <NumberStepper
      label={label}
      value={typeof value === 'number' ? value : null}
      min={min}
      max={max}
      step={control.step}
      disabled={disabled}
      unknownValue="Not set"
      {...(control.unit === undefined ? {} : { unit: control.unit })}
      onChange={onChange}
    />
  );
}

export function TextLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<Extract<FieldControl, { t: 'text' }>>): ReactNode {
  return (
    <TextField
      label={label}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function ChoiceLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<Extract<FieldControl, { t: 'choice' }>>): ReactNode {
  return (
    <Select
      label={label}
      disabled={disabled}
      searchable={control.options.length > 7}
      value={typeof value === 'string' ? value : null}
      options={control.options.map((option) => ({ value: option.id, label: option.label }))}
      onChange={onChange}
    />
  );
}

export function DurationLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<FieldControl>): ReactNode {
  return (
    <DurationRow
      label={label}
      value={typeof value === 'number' ? value : undefined}
      fallback={60_000}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
