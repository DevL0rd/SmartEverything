import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Sparkline, type ChartPoint } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { decimal, kilograms } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment, relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useActiveProfile, useBodyReadings, type WeighedReading } from '../../../store/people';
import { useSettings } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { useDayReadings } from '../model/health-readings';
import { useDay } from './health-hero';

function newestFirst(readings: readonly WeighedReading[]): readonly WeighedReading[] {
  return [...readings].sort((left, right) => right.measured_at.localeCompare(left.measured_at));
}

function composition(reading: WeighedReading): string {
  return joinParts([
    reading.composition === null
      ? null
      : `Body fat ${decimal(reading.composition.body_fat_percent, 1)} %`,
    reading.bmi === null ? null : `BMI ${decimal(reading.bmi, 1)}`,
  ]);
}

function Trend({ points }: { readonly points: readonly ChartPoint[] }): ReactNode {
  if (points.length < 2) {
    return null;
  }
  return (
    <View className="w-full max-w-reading">
      <Sparkline points={points} colour="viz-1" height={56} />
    </View>
  );
}

function WeighIn({ reading }: { readonly reading: WeighedReading }): ReactNode {
  const now = useMinute();
  const detail = composition(reading);
  return (
    <View className="items-center gap-1">
      <Figure value={decimal(reading.weight_kg, 1)} unit="kg" size="xl" />
      <Text variant="footnote" tone="variant">
        {joinParts([relative(reading.measured_at, now), detail])}
      </Text>
    </View>
  );
}

function FromHealthConnect(): ReactNode {
  const weights = useDayReadings('weight');
  const day = useDay();
  const last = weights.at(-1);
  if (last === undefined) {
    return (
      <Text variant="callout" tone="variant" align="center">
        Step on the scale with your phone nearby.
      </Text>
    );
  }
  return (
    <View className="items-center gap-1">
      <Figure value={decimal(last.value, 1)} unit={last.unit} size="xl" stale />
      <Text variant="footnote" tone="variant">
        {`From Health Connect · ${day(last)}`}
      </Text>
    </View>
  );
}

function RecentWeighIns({ readings }: { readonly readings: readonly WeighedReading[] }): ReactNode {
  const now = useMinute();
  const zone = useSettings().time_zone;
  if (readings.length < 2) {
    return null;
  }
  return (
    <List title="Recent weigh-ins">
      {readings.slice(0, 5).map((reading) => {
        const detail = composition(reading);
        return (
          <ListRow
            key={reading.id}
            title={kilograms(reading.weight_kg)}
            {...(detail === '' ? {} : { subtitle: detail })}
            value={moment(reading.measured_at, now, zone)}
          />
        );
      })}
    </List>
  );
}

export function ScaleHero({ device }: { readonly device: Device }): ReactNode {
  const profile = useActiveProfile();
  const readings = newestFirst(useBodyReadings(profile?.id ?? null));
  const latest = readings[0];
  const points = [...readings]
    .reverse()
    .map((reading) => ({ t: Date.parse(reading.measured_at), v: reading.weight_kg }));
  return (
    <View className="gap-section-gap">
      <Card>
        <View className="items-center gap-4 py-2">
          <DeviceVisual device={device} size="hero" />
          {latest === undefined ? <FromHealthConnect /> : <WeighIn reading={latest} />}
          <Trend points={points} />
          <Button
            label="Open in Fitness"
            icon="fitness"
            variant="tonal"
            href={href.fitnessPage('body')}
          />
        </View>
      </Card>
      <RecentWeighIns readings={readings} />
    </View>
  );
}
