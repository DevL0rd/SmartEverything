import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { Text } from '../../../components/text';
import { atLeast, useSizeClass } from '../../../design/size-class';

export interface StepRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

function StackedRow({
  title,
  subtitle,
  control,
}: {
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly control: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-row-h-2 gap-2 px-4 py-2">
      <View className="gap-0.5">
        <Text variant="body">{title}</Text>
        {subtitle === undefined ? null : (
          <Text variant="callout" tone="variant">
            {subtitle}
          </Text>
        )}
      </View>
      <View className="items-end">{control}</View>
    </View>
  );
}

export function StepperRow({
  title,
  subtitle,
  value,
  range,
  unit,
  onChange,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly value: number | null;
  readonly range: StepRange;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  const stepper = (
    <NumberStepper
      label={title}
      value={value}
      min={range.min}
      max={range.max}
      step={range.step}
      unit={unit}
      unknownValue="Off"
      onChange={onChange}
    />
  );
  if (!wide) {
    return <StackedRow title={title} subtitle={subtitle} control={stepper} />;
  }
  return (
    <ListRow
      title={title}
      {...(subtitle === undefined ? {} : { subtitle, wrapSubtitle: true })}
      trailing={stepper}
    />
  );
}
