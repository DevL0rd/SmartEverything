import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  microwavePowerOptions,
  type MicrowaveMode,
  type MicrowaveProgram,
  type MicrowaveTemperatureRange,
  type MicrowaveTimeRange,
} from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { NumberStepper } from '../../../components/number-stepper';
import { TextField } from '../../../components/text-field';
import { Text } from '../../../components/text';
import { microwaveModeLabel, type MicrowaveConfiguration } from './model';

interface ProgramFieldsProps {
  readonly program: MicrowaveProgram;
  readonly mode: MicrowaveMode;
  readonly config: MicrowaveConfiguration;
  readonly onChange: (program: MicrowaveProgram) => void;
  readonly disabled: boolean;
}
export function ProgramFields({
  program,
  mode,
  config,
  onChange,
  disabled,
}: ProgramFieldsProps): ReactNode {
  const duration = mode.supportedOptions.operationTime;
  const temperature = mode.supportedOptions.temperature?.[config.unit];
  const power = microwavePowerOptions(mode, config.supportedPower);
  return (
    <View className="gap-4">
      {duration === undefined ? null : (
        <DurationField
          range={duration}
          value={program.duration}
          disabled={disabled}
          onChange={(next) => {
            onChange({ ...program, duration: next });
          }}
        />
      )}
      {power.length === 0 ? null : (
        <Select
          label="Microwave power"
          options={power.map((value) => ({ value, label: value.replace('W', ' W') }))}
          value={program.power}
          disabled={disabled}
          onChange={(next) => {
            onChange({ ...program, power: next });
          }}
        />
      )}
      {temperature === undefined ? null : (
        <TemperatureField
          range={temperature}
          unit={config.unit}
          value={program.temperature}
          disabled={disabled}
          onChange={(next) => {
            onChange({ ...program, temperature: next });
          }}
        />
      )}
    </View>
  );
}
export function ModeSelect({
  config,
  value,
  onChange,
  disabled,
}: {
  readonly config: MicrowaveConfiguration;
  readonly value: string;
  readonly onChange: (mode: string) => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <Select
      label="Cooking mode"
      value={value}
      options={config.modes.map((mode) => ({
        value: mode.mode,
        label: microwaveModeLabel(mode.mode),
      }))}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function TemperatureField({
  range,
  unit,
  value,
  disabled,
  onChange,
}: {
  readonly range: MicrowaveTemperatureRange;
  readonly unit: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="callout" tone="variant">
        Cooking temperature
      </Text>
      <NumberStepper
        label="Cooking temperature"
        value={value}
        min={range.min}
        max={range.max}
        step={range.resolution}
        unit={`°${unit}`}
        disabled={disabled}
        onChange={onChange}
      />
    </View>
  );
}

function DurationField({
  range,
  value,
  disabled,
  onChange,
}: {
  readonly range: MicrowaveTimeRange;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <TextField
      label="Duration (hours:minutes:seconds)"
      value={value}
      disabled={disabled}
      helper={`${range.min}–${range.max} · ${range.resolution} steps`}
      onChange={onChange}
    />
  );
}
