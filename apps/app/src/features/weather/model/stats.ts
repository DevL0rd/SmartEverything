import { weatherMetricValue, type WeatherForecast } from '@smarteverything/domain';
import type { WidgetStatProps } from '../../../components/widget-board';
import { decimal } from '../../../format/number';
import { aqiLook, degrees, todayOf, uvText, windText } from './present';

export type WeatherStat = WidgetStatProps & { readonly key: string };

function rainStat(forecast: WeatherForecast): WeatherStat {
  const chance = weatherMetricValue(forecast, 'rain_chance');
  return {
    key: 'rain',
    icon: 'umbrella',
    colour: 'humidity',
    label: 'Rain, next 3 h',
    value: chance === null ? '—' : `${decimal(chance)}%`,
  };
}

function airStat(forecast: WeatherForecast): WeatherStat | null {
  const aqi = forecast.air?.now.usAqi ?? null;
  if (aqi === null) {
    return null;
  }
  const look = aqiLook(aqi);
  return {
    key: 'air',
    icon: 'airVent',
    colour: look.role,
    label: 'Air',
    value: look.value,
    caption: look.label,
  };
}

export function weatherStats(forecast: WeatherForecast, now: number): readonly WeatherStat[] {
  const today = todayOf(forecast, now);
  const { uvIndex, windKmh, windDirection } = forecast.now;
  const stats: (WeatherStat | null)[] = [
    today === null
      ? null
      : {
          key: 'range',
          icon: 'thermometer',
          colour: 'temp-warm',
          label: 'High · Low',
          value: `${degrees(today.maxC)} · ${degrees(today.minC)}`,
        },
    rainStat(forecast),
    {
      key: 'wind',
      icon: 'climate',
      colour: 'viz-1',
      label: 'Wind',
      value: windText(windKmh, windDirection),
    },
    uvIndex === null
      ? null
      : { key: 'uv', icon: 'sun', colour: 'warning', label: 'UV', value: uvText(uvIndex) },
    airStat(forecast),
  ];
  return stats.filter((stat) => stat !== null);
}
