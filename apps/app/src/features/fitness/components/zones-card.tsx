import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { percentOf } from '../../../components/charts/stage-timeline';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMaxHeartRateSetting } from '../data/goals';
import { useBestDay, useRecords } from '../data/queries';
import { hoursMinutes } from '../../../format/time';
import { ZONES, heartSamplesOf, maximumHeartRate, zoneMinutes, type ZoneKey } from '../model/heart';
import type { Window } from '../model/window';

const ZONE_FILL: Readonly<Record<ZoneKey, string>> = {
  warm: 'bg-viz-6',
  easy: 'bg-viz-1',
  aerobic: 'bg-viz-5',
  hard: 'bg-viz-2',
  peak: 'bg-critical',
};

function ZoneRow({
  label,
  from,
  minutes,
  share,
  zone,
}: {
  readonly label: string;
  readonly from: number;
  readonly minutes: number;
  readonly share: number;
  readonly zone: ZoneKey;
}): ReactNode {
  const fill = { width: percentOf(share) };
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline gap-2">
        <Text variant="callout" className="flex-1" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular">
          {`${String(from)}+ bpm`}
        </Text>
        <Text variant="callout" className="w-16 text-right tabular">
          {hoursMinutes(minutes)}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-2">
        <View style={fill} className={cn('h-full rounded-full', ZONE_FILL[zone])} />
      </View>
    </View>
  );
}

export function ZonesCard({ window }: { readonly window: Window }): ReactNode {
  const records = useRecords(['HeartRate'], window.start, window.end);
  const highest = useBestDay('heart_rate_maximum', false);
  const samples = heartSamplesOf(records.data ?? []);
  const observed = highest.data === undefined || highest.data === null ? [] : [highest.data.value];
  const maximum = maximumHeartRate(useMaxHeartRateSetting(), [
    ...observed,
    ...samples.map((s) => s.bpm),
  ]);
  if (records.data === undefined) {
    return <Skeleton shape="block" className="h-56" />;
  }
  if (maximum === null || samples.length === 0) {
    return null;
  }
  const zones = zoneMinutes(samples, maximum.bpm);
  const most = Math.max(1, ...ZONES.map((zone) => zones[zone.key]));
  return (
    <Card title="Heart rate zones" icon="gauge">
      <View className="gap-3">
        {ZONES.map((zone) => (
          <ZoneRow
            key={zone.key}
            zone={zone.key}
            label={zone.label}
            from={Math.round(zone.from * maximum.bpm)}
            minutes={zones[zone.key]}
            share={zones[zone.key] / most}
          />
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        {maximum.basis === 'setting'
          ? `Based on your maximum of ${String(maximum.bpm)} bpm`
          : `Based on the highest in your data, ${String(maximum.bpm)} bpm`}
      </Text>
    </Card>
  );
}
