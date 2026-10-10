import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BAND_LABELS, type Band, type BandMetric } from '@smarteverything/domain';
import { Text } from '../../components/text';
import type { Tone } from '../../components/tone';
import { cn } from '../../design/cn';

type Kind = 'good' | 'warn' | 'bad';

const KIND_TONE: Readonly<Record<Kind, Tone>> = {
  good: 'positive',
  warn: 'warning',
  bad: 'critical',
};

const KIND_CLASS: Readonly<Record<Kind, string>> = {
  good: 'bg-positive',
  warn: 'bg-warning',
  bad: 'bg-critical',
};

class BandLabelError extends Error {
  override readonly name = 'BandLabelError';
}

function labelOf(metric: BandMetric, index: number): string {
  const label = BAND_LABELS[metric][index];
  if (label === undefined) {
    throw new BandLabelError(`${metric} has no band ${String(index)}.`);
  }
  return label;
}

function kindOf(label: string): Kind {
  if (label === 'Standard' || label === 'Good') {
    return 'good';
  }
  return label === 'Very high' || label === 'Obese' ? 'bad' : 'warn';
}

export function BandLabel({
  metric,
  band,
}: {
  readonly metric: BandMetric;
  readonly band: Band;
}): ReactNode {
  const label = labelOf(metric, band.band);
  return (
    <Text variant="caption" tone={KIND_TONE[kindOf(label)]}>
      {label}
    </Text>
  );
}

export function BandBar({
  metric,
  band,
}: {
  readonly metric: BandMetric;
  readonly band: Band;
}): ReactNode {
  return (
    <View
      className="flex-row gap-0.5"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {BAND_LABELS[metric].map((label, index) => (
        <View
          key={label}
          className={cn(
            'h-1 flex-1 rounded-full',
            KIND_CLASS[kindOf(label)],
            index === band.band ? 'opacity-100' : 'opacity-25',
          )}
        />
      ))}
    </View>
  );
}
