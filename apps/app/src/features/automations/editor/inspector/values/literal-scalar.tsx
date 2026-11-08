import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Segmented } from '../../../../../components/segmented';
import { Interactive } from '../../../../../components/interactive';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import { TextField } from '../../../../../components/text-field';
import { cn } from '../../../../../design/cn';
import type { FieldControl } from '../schema-fields';
import { DurationRow } from '../sections/duration-row';
import { numberBounds } from './literal-model';

export interface LiteralProps<C extends FieldControl> {
  readonly control: C;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
  readonly showLabel?: boolean;
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
  showLabel = true,
}: LiteralProps<Extract<FieldControl, { t: 'text' }>>): ReactNode {
  return (
    <TextField
      label={label}
      showLabel={showLabel}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function choiceOptionsOf(
  options: readonly { readonly id: string; readonly label: string }[],
  value: JsonValue | undefined,
): readonly { readonly value: string; readonly label: string }[] {
  const known = options.map((option) => ({ value: option.id, label: option.label }));
  if (typeof value !== 'string' || value === '' || options.some((option) => option.id === value)) {
    return known;
  }
  return [...known, { value, label: value }];
}

interface ChoiceRow {
  readonly value: string;
  readonly label: string;
}

interface Fit {
  readonly width: number;
  readonly row: number;
  readonly height: number;
}

const UNMEASURED: Fit = { width: 0, row: 0, height: 0 };

export function wrapsPastOneRow(fit: Fit): boolean {
  return fit.row > 0 && fit.height > fit.row * 1.5;
}

function ChoiceChip({
  row,
  selected,
  disabled,
  onLayout,
  onChange,
}: {
  readonly row: ChoiceRow;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <View onLayout={onLayout}>
      <Interactive
        role="radio"
        label={row.label}
        selected={selected}
        checked={selected}
        disabled={disabled}
        onPress={() => {
          if (!selected) onChange(row.value);
        }}
        className={cn(
          'min-h-touch-min max-w-full flex-row items-center rounded-full border-hairline px-3',
          selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
        )}
        layerClassName="rounded-full"
      >
        <Text variant="label" numberOfLines={1}>
          {row.label}
        </Text>
      </Interactive>
    </View>
  );
}

function ChoiceChips({
  label,
  rows,
  value,
  disabled,
  onFit,
  onChange,
}: {
  readonly label: string;
  readonly rows: readonly ChoiceRow[];
  readonly value: string | null;
  readonly disabled: boolean;
  readonly onFit: (update: (fit: Fit) => Fit) => void;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row flex-wrap gap-1.5"
      onLayout={(event) => {
        const { height } = event.nativeEvent.layout;
        onFit((fit) => ({ ...fit, height }));
      }}
    >
      {rows.map((row, index) => (
        <ChoiceChip
          key={row.value}
          row={row}
          selected={row.value === value}
          disabled={disabled}
          onChange={onChange}
          {...(index === 0
            ? {
                onLayout: (event: LayoutChangeEvent): void => {
                  const { height } = event.nativeEvent.layout;
                  onFit((fit) => ({ ...fit, row: height }));
                },
              }
            : {})}
        />
      ))}
    </View>
  );
}

export function ChoiceLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: LiteralProps<Extract<FieldControl, { t: 'choice' }>>): ReactNode {
  const [fit, setFit] = useState<Fit>(UNMEASURED);
  const rows = choiceOptionsOf(control.options, value);
  const held = typeof value === 'string' ? value : null;
  return (
    <View
      className="gap-1"
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        setFit((current) => (current.width === width ? current : { ...UNMEASURED, width }));
      }}
    >
      {wrapsPastOneRow(fit) ? (
        <Select
          label={label}
          showLabel={showLabel}
          disabled={disabled}
          searchable
          value={held}
          options={rows}
          onChange={onChange}
        />
      ) : (
        <>
          {showLabel ? (
            <Text variant="footnote" tone="variant">
              {label}
            </Text>
          ) : null}
          <ChoiceChips
            label={label}
            rows={rows}
            value={held}
            disabled={disabled}
            onFit={setFit}
            onChange={onChange}
          />
        </>
      )}
    </View>
  );
}

export function DurationLiteral({
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: LiteralProps<FieldControl>): ReactNode {
  return (
    <DurationRow
      label={label}
      showLabel={showLabel}
      inset={false}
      least={0}
      value={typeof value === 'number' ? value : undefined}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
