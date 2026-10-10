import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { SeriesDomain } from '../components/series-domain';
import { ZonesCard } from '../components/zones-card';
import { useFitnessParams } from '../data/day';
import { useReadiness } from '../data/readiness';
import { useTodayData } from '../data/today';
import { windowOf } from '../model/window';

function ReadinessNote({
  day,
  today,
}: {
  readonly day: string;
  readonly today: string;
}): ReactNode {
  const data = useTodayData(day, today);
  const score = useReadiness(data);
  if (score !== null) {
    return null;
  }
  return (
    <Text variant="callout" tone="variant">
      Readiness needs last night’s sleep or heart rate variability.
    </Text>
  );
}

export function HeartScreen(): ReactNode {
  const { day, today, range } = useFitnessParams('week');
  return (
    <SeriesDomain
      domain="heart"
      before={<ReadinessNote day={day} today={today} />}
      after={<ZonesCard window={windowOf(range === 'day' ? 'day' : 'week', day)} />}
    />
  );
}
