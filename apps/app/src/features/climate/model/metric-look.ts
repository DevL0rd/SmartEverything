import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import {
  BANDS,
  comparable,
  dialFor,
  dialOf,
  zoneOf,
  type ComfortMetric,
  type DialScale,
} from './bands';
import type { MetricReading } from './comfort';

const ICONS: Readonly<Record<ComfortMetric, IconName>> = {
  temperature: 'thermometer',
  humidity: 'droplet',
  pm25: 'airVent',
  co2: 'cloud',
};

const SHORT: Readonly<Record<ComfortMetric, string>> = {
  temperature: 'Temp',
  humidity: 'Humidity',
  pm25: 'PM2.5',
  co2: 'CO₂',
};

export function metricColour(reading: MetricReading): ColourRole {
  return zoneOf(BANDS[reading.metric], comparable(reading.amount, reading.unit)).accent;
}

export function metricIcon(metric: ComfortMetric): IconName {
  return ICONS[metric];
}

export function metricShort(metric: ComfortMetric): string {
  return SHORT[metric];
}

export const PM25_SCALE: DialScale = dialOf(BANDS.pm25);

export function dialScale(reading: MetricReading): DialScale {
  return dialFor(reading.metric, reading.unit);
}
