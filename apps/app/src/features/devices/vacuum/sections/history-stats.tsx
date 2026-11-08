import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { VacuumCleanSummary } from '@smarteverything/domain';
import { Card } from '../../../../components/card';
import { Sparkline } from '../../../../components/charts';
import { StatTile } from '../../../../components/stat-tile';
import { Text } from '../../../../components/text';
import { duration } from '../../../../format/time';
import type { Device } from '../../../../store/state';
import { useVacuum } from '../data/use-vacuum';
import type { StatsPeriod } from '../model/stats-period';
import { lifetimeOf, type StatsSummary } from '../model/stats-series';

const SPARK_HEIGHT = 24;
export function cleansIn(
  cleans: readonly VacuumCleanSummary[],
  period: StatsPeriod,
): readonly VacuumCleanSummary[] {
  return cleans.filter((clean) => {
    const at = Date.parse(clean.startedAt);
    return at >= period.startMs && at < period.endMs;
  });
}

function trendOf(
  stats: StatsSummary,
  pick: (bucket: StatsSummary['buckets'][number]) => number,
): ReactNode {
  return (
    <Sparkline
      points={stats.buckets.map((bucket) => ({ t: bucket.startMs, v: pick(bucket) }))}
      colour="viz-1"
      height={SPARK_HEIGHT}
    />
  );
}

export function Tiles({ stats }: { readonly stats: StatsSummary }): ReactNode {
  const { totals } = stats;
  const average =
    totals.averageSeconds === null || totals.averageAreaM2 === null
      ? '—'
      : `${duration(totals.averageSeconds)} · ${String(Math.round(totals.averageAreaM2))} m²`;
  return (
    <View className="gap-3">
      <TileCell
        label="Area cleaned"
        value={`${String(Math.round(totals.areaM2))} m²`}
        trend={trendOf(stats, (bucket) => bucket.areaM2)}
      />
      <TileCell
        label="Time cleaning"
        value={duration(totals.seconds)}
        trend={trendOf(stats, (bucket) => bucket.seconds)}
      />
      <TileCell
        label="Cleans"
        value={String(totals.cleans)}
        trend={trendOf(stats, (bucket) => bucket.cleans)}
      />
      <TileCell label="Average clean" value={average} />
    </View>
  );
}

function TileCell({
  label,
  value,
  trend,
}: {
  readonly label: string;
  readonly value: string;
  readonly trend?: ReactNode;
}): ReactNode {
  return (
    <StatTile compact label={label} value={value} {...(trend === undefined ? {} : { trend })} />
  );
}

export function lifetimeLine(cleans: number | null, minutes: number | null): string {
  const reported = (cleans ?? 0) > 0 || (minutes ?? 0) > 0;
  if (!reported) {
    return 'Not reported yet';
  }
  return [
    minutes === null ? null : `${duration(minutes * 60)} cleaning`,
    cleans === null ? null : `${String(cleans)} ${cleans === 1 ? 'clean' : 'cleans'}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

export function Lifetime({ device }: { readonly device: Device }): ReactNode {
  const { snapshot } = useVacuum(device);
  const { cleans, minutes } = lifetimeOf(snapshot.values);
  if (cleans === null && minutes === null) {
    return null;
  }
  return (
    <Card title="Lifetime">
      <Text variant="body" className="tabular">
        {lifetimeLine(cleans, minutes)}
      </Text>
      <Text variant="footnote" tone="variant">
        Totals counted by the robot itself.
      </Text>
    </Card>
  );
}
