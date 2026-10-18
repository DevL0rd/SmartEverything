import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerMetric, ComputerParts } from '@smarteverything/domain';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import type { FigureSize } from '../../../components/figure';
import type { Tone } from '../../../components/tone';
import { decimal } from '../../../format/number';
import { useHeadline } from '../data/computer-headlines';
import { useComputerSelect } from '../data/computer-metrics';
import { spokenFact } from '../model/spoken-unit';

export interface LiveFactProps {
  readonly deviceId: string;
  readonly label: string;
  readonly read: (parts: ComputerParts) => number | null;
  readonly metric?: ComputerMetric;
  readonly unit: string;
  readonly widest: string;
  readonly size?: FigureSize;
  readonly digits?: number;
  readonly stale?: boolean;
  readonly showLabel?: boolean;
  readonly toneOf?: (value: number) => Tone;
}

function FactView({
  fact,
  value,
  stale,
}: {
  readonly fact: LiveFactProps;
  readonly value: number | null;
  readonly stale: boolean;
}): ReactNode {
  const { label, unit, widest, size = 'm', digits = 0, showLabel = true, toneOf } = fact;
  if (value === null) return null;
  const text = decimal(value, digits);
  return (
    <View accessible accessibilityLabel={spokenFact(label, text, unit)} className="min-w-0">
      <View aria-hidden>
        {label === '' || !showLabel ? null : (
          <Text variant="caption" tone="variant">
            {label}
          </Text>
        )}
        <LiveFigure
          value={text}
          unit={unit}
          size={size}
          widest={widest}
          stale={stale}
          {...(toneOf === undefined ? {} : { tone: toneOf(value) })}
        />
      </View>
    </View>
  );
}

function OnlineFact(fact: LiveFactProps): ReactNode {
  const { deviceId, read, digits = 0 } = fact;
  const value = useComputerSelect(deviceId, (parts) => {
    const reading = read(parts);
    return reading === null ? null : Number(reading.toFixed(digits));
  });
  return <FactView fact={fact} value={value} stale={fact.stale ?? false} />;
}

function HeldFact({
  metric,
  ...fact
}: LiveFactProps & { readonly metric: ComputerMetric }): ReactNode {
  const held = useHeadline(fact.deviceId, metric);
  const digits = fact.digits ?? 0;
  return (
    <FactView fact={fact} value={held === null ? null : Number(held.value.toFixed(digits))} stale />
  );
}

export function LiveFact(props: LiveFactProps): ReactNode {
  const { metric } = props;
  return props.stale === true && metric !== undefined ? (
    <HeldFact {...props} metric={metric} />
  ) : (
    <OnlineFact {...props} />
  );
}
