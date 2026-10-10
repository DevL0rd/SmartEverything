import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { decimal, withUnit } from '../format/number';
import { selectionTick } from '../platform/haptics';
import { decimalsOf, snap } from './charts/scale';
import { IconButton } from './icon-button';
import { Text } from './text';

export interface NumberStepperProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly formatValue?: (value: number) => string;
}

export function stepFormat(step: number): (value: number) => string {
  const digits = decimalsOf(step);
  return (value) => decimal(value, digits);
}

function StepperValue({
  text,
  disabled,
}: {
  readonly text: string;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <Text
      variant="body-strong"
      align="center"
      numberOfLines={1}
      className={cn('min-w-10 shrink tabular', disabled && 'opacity-40')}
    >
      {text}
    </Text>
  );
}

export function NumberStepper(props: NumberStepperProps): ReactNode {
  const { value, min, max, step, onChange, label, unit, disabled = false } = props;
  const formatValue = props.formatValue ?? stepFormat(step);
  const written = withUnit(formatValue(value), unit);
  const change = (by: number): void => {
    const next = snap(value + by, { min, max }, step);
    if (!disabled && next !== value) {
      selectionTick();
      onChange(next);
    }
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value, text: written }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        change(event.nativeEvent.actionName === 'increment' ? step : -step);
      }}
      className="max-w-full flex-row items-center gap-1 self-start rounded-full bg-surface-2"
    >
      <IconButton
        icon="minus"
        label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onPress={() => {
          change(-step);
        }}
      />
      <StepperValue text={written} disabled={disabled} />
      <IconButton
        icon="plus"
        label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onPress={() => {
          change(step);
        }}
      />
    </View>
  );
}
