import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { WhiteTrack } from '../../../../../components/level-marks';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Slider } from '../../../../../components/slider';
import { Text } from '../../../../../components/text';
import { cn } from '../../../../../design/cn';
import type { FieldControl } from '../schema-fields';
import type { LiteralProps } from './literal-scalar';
import { kelvinRange, warmthOf, type Warmth } from './moment-model';

type NumberControl = Extract<FieldControl, { t: 'number' }>;

const WARMTH_FILL: Readonly<Record<Warmth, string>> = {
  Warm: 'bg-temp-warm',
  Neutral: 'bg-temp-neutral',
  Cool: 'bg-temp-cool',
};

function Preview({ kelvin }: { readonly kelvin: number | null }): ReactNode {
  const warmth = kelvin === null ? null : warmthOf(kelvin);
  return (
    <View className="flex-row items-center gap-2">
      <View
        aria-hidden
        className={cn(
          'size-6 rounded-full border-hairline border-outline',
          warmth === null ? 'bg-surface-3' : WARMTH_FILL[warmth],
        )}
      />
      <Text variant="footnote" tone="variant">
        {warmth === null ? 'Not set' : `${warmth} white`}
      </Text>
    </View>
  );
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function baseNumber(control: FieldControl): NumberControl | null {
  if (control.t === 'number') return control;
  return control.t === 'editor' ? baseNumber(control.base) : null;
}

export function KelvinLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<FieldControl>): ReactNode {
  const number = baseNumber(control);
  const kelvin = numberOf(value);
  const range = kelvinRange(number?.min, number?.max);
  const step = number?.step ?? 1;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-3">
        <NumberStepper
          label={label}
          value={kelvin}
          min={number?.min ?? 0}
          max={number?.max ?? Number.MAX_SAFE_INTEGER}
          step={step}
          unit="K"
          disabled={disabled}
          unknownValue="Not set"
          onChange={onChange}
        />
        <Preview kelvin={kelvin} />
      </View>
      {range === null ? null : (
        <View className="gap-1">
          <View className="h-1.5 overflow-hidden rounded-full" aria-hidden>
            <WhiteTrack disabled={disabled} />
          </View>
          <Slider
            label={`${label} from warm to cool`}
            value={kelvin}
            min={range.min}
            max={range.max}
            step={step}
            disabled={disabled}
            unknownValue="Not set"
            formatValue={(next) => `${String(next)} K`}
            onCommit={onChange}
          />
        </View>
      )}
    </View>
  );
}
