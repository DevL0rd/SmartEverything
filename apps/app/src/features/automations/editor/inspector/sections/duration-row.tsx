import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import type { DurationUnit } from './duration-model';
import { DURATION_UNITS, atLeast, inUnit, joinDuration, splitDuration } from './duration-model';

export interface DurationRowProps {
  readonly label: string;
  readonly caption?: string;
  readonly value: number | undefined;
  readonly fallback?: number;
  readonly onChange: (milliseconds: number) => void;
  readonly disabled?: boolean;
  readonly showLabel?: boolean;
  readonly inset?: boolean;
  readonly least?: number;
}

function Label({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      {text}
    </Text>
  );
}

function useUnit(shown: number | undefined): readonly [DurationUnit, (unit: DurationUnit) => void] {
  const [unit, setUnit] = useState<DurationUnit>(
    shown === undefined ? 's' : splitDuration(shown).unit,
  );
  return [unit, setUnit];
}

export function DurationRow({
  label,
  caption,
  value,
  fallback,
  onChange,
  disabled = false,
  showLabel = true,
  inset = true,
  least = 1,
}: DurationRowProps): ReactNode {
  const shown = value ?? fallback;
  const [unit, setUnit] = useUnit(shown);
  const amount = shown === undefined ? null : inUnit(shown, unit).amount;
  return (
    <View className={inset ? 'gap-1 px-4 py-2' : 'gap-1'}>
      {showLabel ? <Label text={label} /> : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <NumberStepper
          label={label}
          value={amount}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          disabled={disabled}
          unknownValue="Not set"
          onChange={(next) => {
            onChange(atLeast(joinDuration({ amount: next, unit }), least));
          }}
        />
        <Segmented
          label={`${label} unit`}
          options={DURATION_UNITS}
          value={unit}
          disabled={disabled}
          onChange={(next) => {
            setUnit(next);
            if (amount !== null) onChange(atLeast(joinDuration({ amount, unit: next }), least));
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
