import type { JsonValue } from '@smarteverything/domain';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useControl } from '../../../store/control';
import { treadmillPrefix } from '../data/treadmill-keys';

interface Base {
  readonly title: string;
  readonly subtitle?: string;
  readonly disabled?: boolean;
}

export interface StepRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

function StackedRow({
  title,
  subtitle,
  disabled,
  children,
}: {
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly disabled: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className={cn('min-h-row-h gap-2 px-4 py-3', disabled && 'opacity-40')}>
      <View className="gap-0.5">
        <Text variant="body">{title}</Text>
        {subtitle === undefined ? null : (
          <Text variant="callout" tone="variant">
            {subtitle}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export function StepperRow({
  title,
  subtitle,
  disabled,
  value,
  range,
  unit,
  onChange,
}: Base & {
  readonly value: number;
  readonly range: StepRange;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const narrow = !atLeast(useSizeClass().width, 'medium');
  const stepper = (
    <NumberStepper
      label={title}
      value={value}
      min={range.min}
      max={range.max}
      step={range.step}
      unit={unit}
      onChange={onChange}
      {...(disabled === undefined ? {} : { disabled })}
    />
  );
  if (narrow) {
    return (
      <StackedRow title={title} subtitle={subtitle} disabled={disabled === true}>
        {stepper}
      </StackedRow>
    );
  }
  return (
    <ListRow
      title={title}
      {...(subtitle === undefined ? {} : { subtitle, wrapSubtitle: true })}
      {...(disabled === undefined ? {} : { disabled })}
      trailing={stepper}
    />
  );
}

function useWriter(deviceId: string, capability: string): (value: JsonValue) => void {
  const control = useControl(deviceId, capability);
  const client = useQueryClient();
  return (value): void => {
    background(
      control
        .set(value)
        .then(() => client.invalidateQueries({ queryKey: treadmillPrefix(deviceId) })),
      'control.set_failed',
    );
  };
}

export function PadSwitchRow({
  deviceId,
  capability,
  value,
  ...row
}: Base & {
  readonly deviceId: string;
  readonly capability: string;
  readonly value: boolean;
}): ReactNode {
  const write = useWriter(deviceId, capability);
  return <SwitchRow {...row} value={value} onChange={write} />;
}

export function PadStepperRow({
  deviceId,
  capability,
  ...row
}: Base & {
  readonly deviceId: string;
  readonly capability: string;
  readonly value: number;
  readonly range: StepRange;
  readonly unit: string;
}): ReactNode {
  const write = useWriter(deviceId, capability);
  return <StepperRow {...row} onChange={write} />;
}

export function PadSelectRow<T extends string>({
  deviceId,
  capability,
  options,
  value,
  ...row
}: Base & {
  readonly deviceId: string;
  readonly capability: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T | null;
}): ReactNode {
  const write = useWriter(deviceId, capability);
  return <SelectRow {...row} options={options} value={value} onChange={write} />;
}
