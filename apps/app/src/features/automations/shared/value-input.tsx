import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { HSV_COLOR, type DeviceCapability, type JsonValue } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { DeviceLike } from './capability-choices';
import { Labelled } from './labelled';
import { SchemaArgumentsInput } from './schema-arguments-input';
import { optionsOf, unitOf, valueLabel } from './present';

export interface ValueInputProps {
  readonly device: DeviceLike;
  readonly capability: DeviceCapability;
  readonly label: string;
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
}

function BooleanInput({ device, capability, label, value, onChange }: ValueInputProps): ReactNode {
  return (
    <Segmented
      label={label}
      value={value === false ? 'off' : 'on'}
      options={[
        { value: 'on', label: valueLabel(device, capability, true) },
        { value: 'off', label: valueLabel(device, capability, false) },
      ]}
      onChange={(next) => {
        onChange(next === 'on');
      }}
    />
  );
}

function EnumInput({ device, capability, label, value, onChange }: ValueInputProps): ReactNode {
  return (
    <Select
      label={label}
      showLabel={false}
      value={typeof value === 'string' ? value : null}
      options={optionsOf(device, capability)}
      onChange={onChange}
    />
  );
}

function NumberInput({ device, capability, label, value, onChange }: ValueInputProps): ReactNode {
  if (capability.value.kind !== 'number') {
    return null;
  }
  const { min, max, step } = capability.value;
  const unit = unitOf(device, capability);
  return (
    <NumberStepper
      label={label}
      value={typeof value === 'number' ? value : min}
      min={min}
      max={max}
      step={step}
      {...(unit === null ? {} : { unit })}
      onChange={onChange}
    />
  );
}

function ColourInput({ label, value, onChange }: ValueInputProps): ReactNode {
  const colour = HSV_COLOR.safeParse(value);
  const current = colour.success ? colour.data : { hue: 0, saturation: 100, value: 100 };
  return (
    <Slider
      label={`${label} hue`}
      value={current.hue}
      min={0}
      max={360}
      step={1}
      onCommit={(hue) => {
        onChange({ ...current, hue });
      }}
    />
  );
}

const ARGUMENTS = z.record(z.string(), z.unknown());

function ArgumentsInput({ capability, value, onChange }: ValueInputProps): ReactNode {
  if (capability.value.kind !== 'action' || capability.value.arguments === undefined) {
    return null;
  }
  const names = capability.value.arguments;
  const read = ARGUMENTS.safeParse(value);
  const textOf = (name: string): string => {
    const typed = read.success ? read.data[name] : undefined;
    return typeof typed === 'string' ? typed : '';
  };
  return (
    <View className="gap-3">
      {names.map((name) => (
        <TextField
          key={name}
          label={name}
          value={textOf(name)}
          onChange={(text) => {
            onChange(
              Object.fromEntries(names.map((arg) => [arg, arg === name ? text : textOf(arg)])),
            );
          }}
        />
      ))}
    </View>
  );
}

export function ValueInput(props: ValueInputProps): ReactNode {
  switch (props.capability.value.kind) {
    case 'boolean':
      return (
        <Labelled label={props.label}>
          <BooleanInput {...props} />
        </Labelled>
      );
    case 'enum':
      return (
        <View className="gap-1">
          <Text variant="footnote" tone="variant">
            {props.label}
          </Text>
          <EnumInput {...props} />
        </View>
      );
    case 'number':
      return <NumberInput {...props} />;
    case 'color':
      return <ColourInput {...props} />;
    case 'text':
      return (
        <TextField
          label={props.label}
          value={typeof props.value === 'string' ? props.value : ''}
          onChange={props.onChange}
        />
      );
    case 'action':
      return props.capability.value.argumentSchema === undefined ? (
        <ArgumentsInput {...props} />
      ) : (
        <SchemaArgumentsInput {...props} />
      );
  }
}
