import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Sparkline } from '../../../components/charts';
import { usePlannerStats } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { listTrendOf } from './task-grouping';

const TREND_DOMAIN = [0, 1] as const;

export const ListTrend = memo(function ListTrend({
  collectionId,
  name,
}: {
  readonly collectionId: string;
  readonly name: string;
}): ReactNode {
  const { person } = usePlannerFrame();
  const stats = usePlannerStats(person, 'month').data;
  const trend = listTrendOf(stats, collectionId);
  if (trend === null) return null;
  return (
    <View
      role="img"
      aria-label={`${name} completion, last ${String(trend.weeks)} weeks`}
      className="w-10 shrink-0"
    >
      <Sparkline
        points={trend.points}
        colour="on-surface-variant"
        height={14}
        domain={TREND_DOMAIN}
      />
    </View>
  );
});
