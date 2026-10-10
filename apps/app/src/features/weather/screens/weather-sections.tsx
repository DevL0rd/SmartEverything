import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { Grid } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import { HScroller } from '../../../components/h-scroller';
import { StatTile } from '../../../components/stat-tile';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { clock, hoursMinutes } from '../../../format/time';
import { DayList, HourCell } from '../components/forecast-parts';
import { degrees, sunOf, todayOf, upcomingHours, uvText, windText } from '../model/present';

interface SectionProps {
  readonly forecast: WeatherForecast;
  readonly now: number;
}

function LegendItem({
  colour,
  label,
}: {
  readonly colour: ColourRole;
  readonly label: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name="circle" size={16} colour={colour} />
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function ChartLegend(): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      <LegendItem colour="temp-warm" label="Temperature" />
      <LegendItem colour="viz-4" label="Feels like" />
    </View>
  );
}

export function HourlySection({ forecast, now }: SectionProps): ReactNode {
  const hours = upcomingHours(forecast, now, 48);
  const points = hours.map((hour) => ({ t: Date.parse(hour.at), v: hour.temperatureC }));
  const feels = hours.map((hour) => ({ t: Date.parse(hour.at), v: hour.feelsLikeC }));
  return (
    <Card title="Next 48 hours" icon="clock">
      <View className="gap-4">
        <HScroller label="Hourly forecast">
          <View className="flex-row gap-1">
            {hours.map((hour, index) => (
              <HourCell
                key={hour.at}
                hour={hour}
                index={index}
                timeZone={forecast.timeZone}
                fixed
              />
            ))}
          </View>
        </HScroller>
        <TimeSeriesChart
          series={[
            { points, colour: 'temp-warm', label: 'Temperature' },
            { points: feels, colour: 'viz-4', label: 'Feels like' },
          ]}
          range="24h"
          height={160}
          fit
          formatValue={(value) => degrees(value)}
          marker={{ at: now, label: 'Now' }}
        />
        <ChartLegend />
      </View>
    </Card>
  );
}

export function DailySection({ forecast, now }: SectionProps): ReactNode {
  return (
    <Card title="10-day forecast" icon="calendar">
      <DayList forecast={forecast} now={now} count={10} />
    </Card>
  );
}

export function SunSection({ forecast, now }: SectionProps): ReactNode {
  const sun = sunOf(todayOf(forecast, now));
  if (sun === null) {
    return null;
  }
  return (
    <Card title="Sun" icon="sunrise">
      <Grid minItemWidth={120} gap="tight">
        <StatTile label="Sunrise" value={clock(sun.sunrise, forecast.timeZone)} />
        <StatTile label="Sunset" value={clock(sun.sunset, forecast.timeZone)} />
        {sun.daylightSeconds === null ? null : (
          <StatTile label="Daylight" value={hoursMinutes(Math.round(sun.daylightSeconds / 60))} />
        )}
      </Grid>
    </Card>
  );
}

export function DetailsSection({ forecast, now }: SectionProps): ReactNode {
  const current = forecast.now;
  const today = todayOf(forecast, now);
  return (
    <Card title="Right now" icon="gauge">
      <Grid minItemWidth={140} gap="tight">
        <StatTile label="Humidity" value={decimal(current.humidityPercent)} unit="%" />
        {current.dewPointC === null ? null : (
          <StatTile label="Dew point" value={degrees(current.dewPointC)} />
        )}
        <StatTile
          label="Wind"
          value={windText(current.windKmh, current.windDirection)}
          {...(current.gustKmh === null
            ? {}
            : { caption: `Gusts ${decimal(current.gustKmh)} km/h` })}
        />
        {current.uvIndex === null ? null : (
          <StatTile label="UV index" value={uvText(current.uvIndex)} />
        )}
        {current.pressureHpa === null ? null : (
          <StatTile label="Pressure" value={decimal(current.pressureHpa)} unit="hPa" />
        )}
        {current.visibilityM === null ? null : (
          <StatTile label="Visibility" value={decimal(current.visibilityM / 1000, 1)} unit="km" />
        )}
        {current.cloudPercent === null ? null : (
          <StatTile label="Cloud cover" value={decimal(current.cloudPercent)} unit="%" />
        )}
        {today === null ? null : (
          <StatTile label="Rain today" value={decimal(today.precipitationMm, 1)} unit="mm" />
        )}
      </Grid>
    </Card>
  );
}

export function Attribution({
  fetchedAt,
  timeZone,
}: {
  readonly fetchedAt: string;
  readonly timeZone: string;
}): ReactNode {
  return (
    <Text variant="caption" tone="faint" align="center">
      {`Updated ${clock(fetchedAt, timeZone)} · Weather by Open-Meteo.com (CC BY 4.0) · Air quality by Copernicus CAMS`}
    </Text>
  );
}
