import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';

export interface StepRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export function StepperRow({
  title,
  subtitle,
  disabled,
  value,
  range,
  unit,
  onChange,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly disabled?: boolean;
  readonly value: number;
  readonly range: StepRange;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <ListRow
      title={title}
      {...(subtitle === undefined ? {} : { subtitle, wrapSubtitle: true })}
      {...(disabled === undefined ? {} : { disabled })}
      trailing={
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
      }
    />
  );
}
