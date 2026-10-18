import {
  POLLEN_KINDS,
  US_AQI_BANDS,
  type AirDay,
  type PollenKind,
  type WeatherAir,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Dot } from '../../../components/badge';
import { Card } from '../../../components/card';
import { airGauge } from '../../../components/air-look';
import { Gauge } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Grid } from '../../../components/grid';
import { StatTile } from '../../../components/stat-tile';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { titleCase } from '../../../format/text';
import { Details, RetryButton } from '../components/weather-notice';
import { aqiLook, weekdayOf } from '../model/present';

const AQI = airGauge(US_AQI_BANDS);

function Headline({ aqi }: { readonly aqi: number }): ReactNode {
  const look = aqiLook(aqi);
  return (
    <View className="flex-row items-center gap-4">
      <Gauge
        value={Math.min(aqi, AQI.max)}
        min={0}
        max={AQI.max}
        bands={AQI.bands}
        size={112}
        thickness={10}
        label={`US AQI ${look.value}, ${look.label}`}
      >
        <Figure value={look.value} size="m" />
      </Gauge>
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="title-3" tone={look.tone} numberOfLines={2}>
          {look.label}
        </Text>
        <Text variant="footnote" tone="variant">
          US air quality index outside
        </Text>
      </View>
    </View>
  );
}

function Days({ days }: { readonly days: readonly AirDay[] }): ReactNode {
  return (
    <View className="flex-row gap-2">
      {days.map((day) =>
        day.usAqiMax === null ? null : (
          <View key={day.day} className="min-w-0 flex-1 items-center gap-1">
            <Text variant="caption" tone="variant">
              {weekdayOf(day.day)}
            </Text>
            <Dot tone={aqiLook(day.usAqiMax).tone} />
            <Text variant="footnote">{decimal(day.usAqiMax)}</Text>
          </View>
        ),
      )}
    </View>
  );
}

function pollenOf(air: WeatherAir): readonly (readonly [PollenKind, number])[] {
  return POLLEN_KINDS.flatMap((kind) => {
    const value = air.now.pollen[kind];
    return value === null ? [] : [[kind, value] as const];
  });
}

function AirUnavailable({ problem }: { readonly problem: string }): ReactNode {
  return (
    <Card title="Outdoor air" icon="airVent">
      <View className="gap-3">
        <Text variant="body">Air quality isn’t available right now.</Text>
        <View className="flex-row">
          <RetryButton />
        </View>
        <Details reason={problem} />
      </View>
    </Card>
  );
}

export function AirSection({
  air,
  problem,
}: {
  readonly air: WeatherAir | null;
  readonly problem: string | null;
}): ReactNode {
  if (air === null) {
    return problem === null ? null : <AirUnavailable problem={problem} />;
  }
  const { now } = air;
  return (
    <Card title="Outdoor air" icon="airVent">
      <View className="gap-4">
        {now.usAqi === null ? null : <Headline aqi={now.usAqi} />}
        <Grid minItemWidth={120} gap="tight">
          {now.pm25 === null ? null : (
            <StatTile label="PM2.5" value={decimal(now.pm25)} unit="µg/m³" />
          )}
          {now.pm10 === null ? null : (
            <StatTile label="PM10" value={decimal(now.pm10)} unit="µg/m³" />
          )}
          {now.ozone === null ? null : (
            <StatTile label="Ozone" value={decimal(now.ozone)} unit="µg/m³" />
          )}
          {now.nitrogenDioxide === null ? null : (
            <StatTile label="NO₂" value={decimal(now.nitrogenDioxide)} unit="µg/m³" />
          )}
          {pollenOf(air).map(([kind, value]) => (
            <StatTile
              key={kind}
              label={`${titleCase(kind)} pollen`}
              value={decimal(value)}
              unit="grains/m³"
            />
          ))}
        </Grid>
        {air.daily.length === 0 ? null : <Days days={air.daily} />}
      </View>
    </Card>
  );
}
