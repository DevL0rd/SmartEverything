import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import type { MetricReading } from '../model/comfort';
import { metricColour, metricIcon, metricShort } from '../model/metric-look';

function verdictOf(reading: MetricReading): string {
  return reading.stale ? 'Not current' : reading.verdict;
}

function InlineReading({ reading }: { readonly reading: MetricReading }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      <IconWell icon={metricIcon(reading.metric)} colour={metricColour(reading)} size="l" />
      <View className="min-w-0 flex-1">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {`${metricShort(reading.metric)} · `}
          <Text variant="caption" tone={reading.stale ? 'faint' : reading.tone}>
            {verdictOf(reading)}
          </Text>
        </Text>
        <Figure
          value={reading.value}
          size="m"
          stale={reading.stale}
          {...(reading.unit === null ? {} : { unit: reading.unit })}
        />
      </View>
    </View>
  );
}

const ROOMY = 3;

function Reading({
  reading,
  roomy,
}: {
  readonly reading: MetricReading;
  readonly roomy: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-2">
        <IconWell icon={metricIcon(reading.metric)} colour={metricColour(reading)} size="s" />
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {metricShort(reading.metric)}
        </Text>
      </View>
      <Figure
        value={reading.value}
        size={roomy ? 'l' : 'm'}
        stale={reading.stale}
        {...(reading.unit === null ? {} : { unit: reading.unit })}
      />
      <Text variant="caption" tone={reading.stale ? 'faint' : reading.tone} numberOfLines={1}>
        {verdictOf(reading)}
      </Text>
    </View>
  );
}

export function ReadingsRow({
  readings,
}: {
  readonly readings: readonly MetricReading[];
}): ReactNode {
  const inline = useIdiom() === 'pointer';
  return (
    <View className="flex-row gap-4">
      {readings.map((reading) =>
        inline ? (
          <InlineReading key={reading.metric} reading={reading} />
        ) : (
          <Reading key={reading.metric} reading={reading} roomy={readings.length <= ROOMY} />
        ),
      )}
    </View>
  );
}
