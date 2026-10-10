import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type AccessibilityActionEvent } from 'react-native';
import { cn } from '../design/cn';
import { decimal, withUnit } from '../format/number';
import { selectionTick } from '../platform/haptics';
import { clamp, decimalsOf } from './charts/scale';
import { IconButton } from './icon-button';
import { committedValue, sanitizeDraft, settledValue } from './number-draft';
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

function plain(value: number): string {
  return String(Number(value.toFixed(6)));
}

interface Range {
  readonly min: number;
  readonly max: number;
}

function useDraft(
  value: number,
  range: Range,
  onChange: (value: number) => void,
): { readonly text: string; readonly type: (typed: string) => void; readonly settle: () => void } {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    text: draft ?? plain(value),
    type: (typed: string): void => {
      const next = sanitizeDraft(typed);
      setDraft(next);
      const committed = committedValue(next, range);
      if (committed !== null && committed !== value) {
        onChange(committed);
      }
    },
    settle: (): void => {
      const settled = draft === null ? null : settledValue(draft, range);
      setDraft(null);
      if (settled !== null && settled !== value) {
        onChange(settled);
      }
    },
  };
}

interface AdjustableArgs {
  readonly label: string;
  readonly value: number;
  readonly range: Range;
  readonly written: string;
  readonly disabled: boolean;
  readonly step: number;
  readonly onAdjust: (by: number) => void;
}

function adjustable(args: AdjustableArgs): {
  readonly accessibilityLabel: string;
  readonly accessibilityRole: 'adjustable';
  readonly accessibilityState: { readonly disabled: boolean };
  readonly accessibilityValue: { min: number; max: number; now: number; text: string };
  readonly accessibilityActions: readonly { readonly name: string }[];
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
} {
  const { label, value, range, written, disabled, step, onAdjust } = args;
  return {
    accessibilityLabel: label,
    accessibilityRole: 'adjustable',
    accessibilityState: { disabled },
    accessibilityValue: { min: range.min, max: range.max, now: value, text: written },
    accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: (event: AccessibilityActionEvent): void => {
      onAdjust(event.nativeEvent.actionName === 'increment' ? step : -step);
    },
  };
}

interface ValueInputProps extends AdjustableArgs {
  readonly unit: string | undefined;
  readonly onChange: (value: number) => void;
}

function ValueInput(props: ValueInputProps): ReactNode {
  const { value, range, unit, disabled, onChange } = props;
  const draft = useDraft(value, range, onChange);
  return (
    <View className="shrink flex-row items-center gap-1">
      <TextInput
        value={draft.text}
        onChangeText={draft.type}
        onBlur={draft.settle}
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={8}
        editable={!disabled}
        {...adjustable(props)}
        cursorColorClassName="accent-primary"
        selectionColorClassName="accent-primary"
        className={cn(
          'w-20 rounded-md px-1 py-2 text-center font-sans-medium text-body text-on-surface tabular outline-none focus:bg-surface-3',
          disabled && 'opacity-40',
        )}
      />
      {unit === undefined || unit === '' ? null : (
        <Text variant="body" tone="variant" className={cn(disabled && 'opacity-40')}>
          {unit}
        </Text>
      )}
    </View>
  );
}

export function NumberStepper(props: NumberStepperProps): ReactNode {
  const { value, min, max, step, onChange, label, unit, disabled = false } = props;
  const formatValue = props.formatValue ?? stepFormat(step);
  const written = withUnit(formatValue(value), unit);
  const typable = props.formatValue === undefined;
  const change = (by: number): void => {
    const digits = Math.max(decimalsOf(step), decimalsOf(value));
    const next = clamp(Number((value + by).toFixed(digits)), { min, max });
    if (!disabled && next !== value) {
      selectionTick();
      onChange(next);
    }
  };
  const access = { label, value, range: { min, max }, written, disabled, step, onAdjust: change };
  return (
    <View
      {...(typable ? {} : { accessible: true, ...adjustable(access) })}
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
      {typable ? (
        <ValueInput {...access} unit={unit} onChange={onChange} />
      ) : (
        <StepperValue text={written} disabled={disabled} />
      )}
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
