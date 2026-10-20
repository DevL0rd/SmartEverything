import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import type { DurationUnit } from './duration-model';
import { DURATION_UNITS, joinDuration, splitDuration } from './duration-model';

const MOST_AMOUNT = 100_000;

export interface DurationRowProps {
  readonly label: string;
  readonly caption?: string;
  readonly value: number | undefined;
  readonly fallback: number;
  readonly onChange: (milliseconds: number) => void;
  readonly disabled?: boolean;
}

export function DurationRow({
  label,
  caption,
  value,
  fallback,
  onChange,
  disabled = false,
}: DurationRowProps): ReactNode {
  const parts = splitDuration(value ?? fallback);
  const change = (amount: number, unit: DurationUnit): void => {
    onChange(Math.max(1, joinDuration({ amount, unit })));
  };
  return (
    <View className="gap-1 px-4 py-2">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <NumberStepper
          label={label}
          value={parts.amount}
          min={0}
          max={MOST_AMOUNT}
          step={1}
          disabled={disabled}
          onChange={(amount) => {
            change(amount, parts.unit);
          }}
        />
        <Segmented
          label={`${label} unit`}
          options={DURATION_UNITS}
          value={parts.unit}
          disabled={disabled}
          onChange={(unit) => {
            change(parts.amount, unit);
          }}
        />
      </View>
      {caption === undefined ? null : (
        <Text variant="footnote" tone="variant">
          {caption}
        </Text>
      )}
    </View>
  );
}
