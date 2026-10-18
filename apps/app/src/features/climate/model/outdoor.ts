import {
  WET_KINDS,
  airBand,
  weatherKindOf,
  weatherMetricValue,
  type WeatherForecast,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { StatusTone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { decimal, signed } from '../../../format/number';
import { comparable } from './bands';
import type { MetricReading } from './comfort';

export interface Comparison {
  readonly key: 'temperature' | 'humidity' | 'pm25';
  readonly label: string;
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly inside: number | null;
  readonly outside: number | null;
  readonly insideText: string;
  readonly outsideText: string;
  readonly delta: string | null;
  readonly max: number;
}

export interface Hint {
  readonly text: string;
  readonly tone: StatusTone;
}

interface Pair {
  readonly inside: number | null;
  readonly outside: number | null;
}

function readingOf(
  readings: readonly MetricReading[],
  metric: MetricReading['metric'],
): number | null {
  const found = readings.find((reading) => reading.metric === metric);
  return found === undefined || found.stale ? null : comparable(found.amount, found.unit);
}

interface Row {
  readonly key: Comparison['key'];
  readonly label: string;
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly digits: number;
  readonly suffix: string;
  readonly max: number;
}

const ROWS: readonly Row[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    icon: 'thermometer',
    colour: 'temp-warm',
    digits: 1,
    suffix: '°',
    max: 45,
  },
  {
    key: 'humidity',
    label: 'Humidity',
    icon: 'droplet',
    colour: 'humidity',
    digits: 0,
    suffix: '%',
    max: 100,
  },
  {
    key: 'pm25',
    label: 'PM2.5 µg/m³',
    icon: 'airVent',
    colour: 'air-moderate',
    digits: 0,
    suffix: '',
    max: 150,
  },
];

function text(row: Row, value: number | null): string {
  return value === null ? '—' : `${decimal(value, row.digits)}${row.suffix}`;
}

function compare(row: Row, pair: Pair): Comparison {
  const { inside, outside } = pair;
  return {
    key: row.key,
    label: row.label,
    icon: row.icon,
    colour: row.colour,
    inside,
    outside,
    insideText: text(row, inside),
    outsideText: text(row, outside),
    delta: inside === null || outside === null ? null : `${signed(outside - inside)}${row.suffix}`,
    max: row.max,
  };
}

function outsideOf(key: Comparison['key'], forecast: WeatherForecast): number | null {
  switch (key) {
    case 'temperature':
      return forecast.now.temperatureC;
    case 'humidity':
      return forecast.now.humidityPercent;
    case 'pm25':
      return weatherMetricValue(forecast, 'pm25');
  }
}

export function comparisonsOf(
  readings: readonly MetricReading[],
  forecast: WeatherForecast,
): readonly Comparison[] {
  return ROWS.map((row) =>
    compare(row, { inside: readingOf(readings, row.key), outside: outsideOf(row.key, forecast) }),
  ).filter((comparison) => comparison.inside !== null || comparison.outside !== null);
}

const DIRTY = new Set(['moderate', 'poor', 'bad', 'severe']);
const RAIN_LIKELY = 60;
const COOLER_BY = 2;

export function hintOf(readings: readonly MetricReading[], forecast: WeatherForecast): Hint | null {
  const outsidePm = weatherMetricValue(forecast, 'pm25');
  const insidePm = readingOf(readings, 'pm25');
  if (
    outsidePm !== null &&
    DIRTY.has(airBand(outsidePm)) &&
    (insidePm === null || outsidePm > insidePm)
  ) {
    return { text: 'Air outside is worse. Keep the windows closed.', tone: 'warning' };
  }
  const rain = weatherMetricValue(forecast, 'rain_chance');
  if (WET_KINDS.has(weatherKindOf(forecast.now.code)) || (rain !== null && rain >= RAIN_LIKELY)) {
    return { text: 'Rain now or soon. Close the windows.', tone: 'info' };
  }
  const inside = readingOf(readings, 'temperature');
  if (inside !== null && forecast.now.temperatureC <= inside - COOLER_BY) {
    return { text: 'Cooler outside. A good time to air out.', tone: 'positive' };
  }
  return null;
}
