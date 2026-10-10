import { airBand } from '@smarteverything/domain';
import type { GaugeBand } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import type { ComfortMetric, MetricReading } from './comfort';

const COOL_BELOW_C = 20;
const COOL_BELOW_F = 68;

const ICONS: Readonly<Record<ComfortMetric, IconName>> = {
  temperature: 'thermometer',
  humidity: 'droplet',
  pm25: 'airVent',
  co2: 'cloud',
};

function fahrenheit(reading: MetricReading): boolean {
  return reading.unit?.includes('F') === true;
}

export function metricColour(reading: MetricReading): ColourRole {
  switch (reading.metric) {
    case 'temperature':
      return reading.amount < (fahrenheit(reading) ? COOL_BELOW_F : COOL_BELOW_C)
        ? 'temp-cool'
        : 'temp-warm';
    case 'humidity':
      return 'humidity';
    case 'pm25':
      return AIR_BAND_COLOUR[airBand(reading.amount)];
    case 'co2':
      return 'viz-6';
  }
}

export function metricIcon(metric: ComfortMetric): IconName {
  return ICONS[metric];
}

const SHORT: Readonly<Record<ComfortMetric, string>> = {
  temperature: 'Temp',
  humidity: 'Humidity',
  pm25: 'PM2.5',
  co2: 'CO₂',
};

export function metricShort(metric: ComfortMetric): string {
  return SHORT[metric];
}

export interface DialScale {
  readonly min: number;
  readonly max: number;
  readonly bands: readonly GaugeBand[];
}

const CELSIUS: DialScale = {
  min: 10,
  max: 35,
  bands: [
    { upTo: 18, colour: 'temp-cool' },
    { upTo: 25, colour: 'positive' },
    { upTo: 35, colour: 'temp-warm' },
  ],
};

const FAHRENHEIT: DialScale = {
  min: 50,
  max: 95,
  bands: [
    { upTo: 64, colour: 'temp-cool' },
    { upTo: 77, colour: 'positive' },
    { upTo: 95, colour: 'temp-warm' },
  ],
};

const HUMIDITY: DialScale = {
  min: 0,
  max: 100,
  bands: [
    { upTo: 30, colour: 'warning' },
    { upTo: 60, colour: 'humidity' },
    { upTo: 100, colour: 'warning' },
  ],
};

const CO2: DialScale = {
  min: 400,
  max: 2000,
  bands: [
    { upTo: 800, colour: 'positive' },
    { upTo: 1200, colour: 'warning' },
    { upTo: 2000, colour: 'critical' },
  ],
};

export const PM25_SCALE: DialScale = {
  min: 0,
  max: 250,
  bands: [
    { upTo: 12, colour: 'air-good' },
    { upTo: 35.4, colour: 'air-fair' },
    { upTo: 55.4, colour: 'air-moderate' },
    { upTo: 150.4, colour: 'air-poor' },
    { upTo: 250, colour: 'air-bad' },
  ],
};

export function dialScale(reading: MetricReading): DialScale {
  switch (reading.metric) {
    case 'temperature':
      return fahrenheit(reading) ? FAHRENHEIT : CELSIUS;
    case 'humidity':
      return HUMIDITY;
    case 'co2':
      return CO2;
    case 'pm25':
      return PM25_SCALE;
  }
}
