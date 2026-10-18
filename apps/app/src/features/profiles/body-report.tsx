import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { decimal, signed } from '../../format/number';
import { joinParts } from '../../format/text';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useActiveProfile, useBodyReadings, type WeighedReading } from '../../store/people';
import { BodyBadges } from './body-badges';
import { BodyHistory } from './body-history';
import { CompositionGrid } from './composition-grid';
import { FinishFitnessCard } from './fitness-ready';

function Hero({
  latest,
  previous,
}: {
  readonly latest: WeighedReading;
  readonly previous: WeighedReading | undefined;
}): ReactNode {
  const now = useMinute();
  const composition = latest.composition;
  return (
    <Card title="Latest weigh-in" icon="scale">
      <View className="gap-2">
        <Figure value={decimal(latest.weight_kg, 1)} unit="kg" size="xl" />
        <Text variant="footnote" tone="variant">
          {joinParts([
            relative(latest.measured_at, now),
            previous === undefined
              ? null
              : `${signed(latest.weight_kg - previous.weight_kg, 1)} kg since last time`,
            latest.bmi === null ? null : `BMI ${decimal(latest.bmi, 1)}`,
            latest.heart_rate === null ? null : `${String(latest.heart_rate)} bpm`,
          ])}
        </Text>
        {composition === null ? null : <BodyBadges composition={composition} />}
      </View>
    </Card>
  );
}

export function BodyReport(): ReactNode {
  const profile = useActiveProfile();
  const readings = useBodyReadings(profile?.id ?? null);
  const [latest, previous] = readings;
  if (latest === undefined) {
    return null;
  }
  return (
    <View className="gap-section-gap">
      <Hero latest={latest} previous={previous} />
      {latest.composition === null ? (
        <FinishFitnessCard />
      ) : (
        <CompositionGrid composition={latest.composition} />
      )}
      <BodyHistory readings={[...readings].reverse()} />
    </View>
  );
}
