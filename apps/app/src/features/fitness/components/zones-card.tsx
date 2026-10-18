import type { ReactNode } from 'react';
import { max } from 'd3-array';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import { useMaxHeartRateSetting } from '../data/goals';
import { useBestDay, useRecords } from '../data/queries';
import { count, withUnit } from '../../../format/number';
import { hoursMinutes } from '../../../format/time';
import { ZONES, heartSamplesOf, maximumHeartRate, zoneMinutes, type ZoneKey } from '../model/heart';
import type { Window } from '../model/window';

const ZONE_COLOUR: Readonly<Record<ZoneKey, ColourRole>> = {
  warm: 'viz-6',
  easy: 'viz-1',
  aerobic: 'viz-5',
  hard: 'viz-2',
  peak: 'critical',
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
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline gap-2">
        <Text variant="callout" className="flex-1" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular">
          {withUnit(`${count(from)}+`, 'bpm')}
        </Text>
        <Text variant="callout" className="w-16 text-right tabular">
          {hoursMinutes(minutes)}
        </Text>
      </View>
      <ProgressBar progress={share} colour={ZONE_COLOUR[zone]} label={label} thick />
    </View>
  );
}

export function ZonesCard({ window }: { readonly window: Window }): ReactNode {
  const records = useRecords(['HeartRate'], window.start, window.end);
  const highest = useBestDay('heart_rate_maximum', false);
  const samples = heartSamplesOf(records.data ?? []);
  const observed = [highest.data?.value, max(samples, (sample) => sample.bpm)].flatMap(
    (bpm) => bpm ?? [],
  );
  const maximum = maximumHeartRate(useMaxHeartRateSetting(), observed);
  if (records.data === undefined) {
    return <Skeleton shape="block" className="h-56" />;
  }
  if (maximum === null || samples.length === 0) {
    return null;
  }
  const zones = zoneMinutes(samples, maximum.bpm);
  const most = ZONES.reduce((largest, zone) => Math.max(largest, zones[zone.key]), 1);
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
          ? `Based on your maximum of ${withUnit(count(maximum.bpm), 'bpm')}`
          : `Based on the highest in your data, ${withUnit(count(maximum.bpm), 'bpm')}`}
      </Text>
    </Card>
  );
}
