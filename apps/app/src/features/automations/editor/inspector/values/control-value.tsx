import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import type { JsonValue, OptionSourceId, PortValue } from '@smarteverything/domain';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Segmented } from '../../../../../components/segmented';
import { Slider } from '../../../../../components/slider';
import { Text } from '../../../../../components/text';
import { deviceRegionSource } from '../../../../../platform/device-region';
import { useRegionPref } from '../../../../region/data/use-money';
import type { FieldControl } from '../schema-fields';
import {
  ACTION_TAKES_NOTHING,
  NEEDS_CONTROL,
  NOT_ON_TARGET,
  homeTemperatureUnit,
  numberScale,
  specOf,
  type ControlValueSpec,
  type TemperatureUnit,
} from './control-model';
import { useControlChoices } from './control-picker';
import { KelvinLiteral } from './kelvin-slider';
import { ColourLiteral } from './literal-colour';
import { ChoiceLiteral, TextLiteral } from './literal-scalar';

interface EditorProps<S extends ControlValueSpec> {
  readonly spec: S;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly showLabel: boolean;
  readonly onChange: (value: JsonValue) => void;
}

function useHomeTemperature(): TemperatureUnit | null {
  const pref = useRegionPref();
  return useMemo(() => homeTemperatureUnit(pref, deviceRegionSource()), [pref]);
}

function SwitchValue({
  spec,
  label,
  value,
  disabled,
  onChange,
}: EditorProps<Extract<ControlValueSpec, { t: 'switch' }>>): ReactNode {
  return (
    <Segmented
      label={label}
      disabled={disabled}
      value={value === true ? 'on' : 'off'}
      options={[
        { value: 'on', label: spec.on },
        { value: 'off', label: spec.off },
      ]}
      onChange={(next) => {
        onChange(next === 'on');
      }}
    />
  );
}

function LevelValue({
  spec,
  label,
  value,
  disabled,
  onChange,
}: EditorProps<Extract<ControlValueSpec, { t: 'number' }>>): ReactNode {
  const scale = numberScale(spec, useHomeTemperature());
  const shown = typeof value === 'number' ? scale.shown(value) : null;
  const unit = scale.unit ?? '';
  const commit = (next: number): void => {
    onChange(scale.stored(next));
  };
  return (
    <View className="gap-2">
      <NumberStepper
        label={label}
        value={shown}
        min={scale.min}
        max={scale.max}
        step={scale.step}
        disabled={disabled}
        unknownValue="Not set"
        {...(scale.unit === null ? {} : { unit: scale.unit })}
        onChange={commit}
      />
      <Slider
        label={`${label} from ${String(scale.min)} to ${String(scale.max)} ${unit}`.trim()}
        value={shown}
        min={scale.min}
        max={scale.max}
        step={scale.step}
        disabled={disabled}
        unknownValue="Not set"
        formatValue={(next) => `${String(next)} ${unit}`.trim()}
        onCommit={commit}
      />
    </View>
  );
}

function KelvinValue({
  spec,
  ...props
}: EditorProps<Extract<ControlValueSpec, { t: 'number' }>>): ReactNode {
  const control: FieldControl = {
    t: 'number',
    integer: false,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    unit: 'K',
  };
  return <KelvinLiteral {...props} control={control} />;
}

function Note({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      {text}
    </Text>
  );
}

function SpecEditor(props: EditorProps<ControlValueSpec>): ReactNode {
  const { spec, ...rest } = props;
  switch (spec.t) {
    case 'switch':
      return <SwitchValue {...rest} spec={spec} />;
    case 'number':
      return spec.kelvin ? (
        <KelvinValue {...rest} spec={spec} />
      ) : (
        <LevelValue {...rest} spec={spec} />
      );
    case 'colour':
      return <ColourLiteral {...rest} control={{ t: 'colour' }} />;
    case 'choice':
      return <ChoiceLiteral {...rest} control={{ t: 'choice', options: spec.options }} />;
    case 'text':
      return <TextLiteral {...rest} control={{ t: 'text' }} />;
    case 'action':
      return <Note text={ACTION_TAKES_NOTHING} />;
  }
}

export interface ControlValueProps {
  readonly source: OptionSourceId;
  readonly control: string;
  readonly ports: Readonly<Record<string, PortValue>>;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly showLabel?: boolean;
  readonly onChange: (value: JsonValue) => void;
}

export function ControlValue({
  source,
  control,
  ports,
  showLabel = true,
  ...rest
}: ControlValueProps): ReactNode {
  const choices = useControlChoices(source, ports);
  if (choices.status !== 'ready') return <Note text={choices.reason} />;
  if (control === '') return <Note text={NEEDS_CONTROL} />;
  const spec = specOf(choices.specs, control);
  if (spec === null) return <Note text={NOT_ON_TARGET} />;
  return <SpecEditor {...rest} spec={spec.value} showLabel={showLabel} />;
}
