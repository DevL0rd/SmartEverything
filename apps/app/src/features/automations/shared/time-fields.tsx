import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';

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
