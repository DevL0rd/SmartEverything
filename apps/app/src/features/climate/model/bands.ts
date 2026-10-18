import {
  AIR_BANDS,
  AIR_BAND_LABELS,
  PM25_UPPER_BOUNDS,
  type AirBand,
} from '@smarteverything/domain';
import { AIR_BAND_TONE, airGauge } from '../../../components/air-look';
import type { GaugeBand } from '../../../components/charts';
import type { StatusTone } from '../../../components/tone';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';

export type ComfortMetric = 'temperature' | 'humidity' | 'pm25' | 'co2';

interface Zone {
  readonly verdict: string;
  readonly tone: StatusTone;
  readonly colour: ColourRole;
  readonly accent: ColourRole;
}

interface Step extends Zone {
  readonly from: number;
  readonly inclusive: boolean;
}

interface Bands {
  readonly min: number;
  readonly max: number;
  readonly floor: Zone;
  readonly steps: readonly Step[];
}

export interface DialScale {
  readonly min: number;
  readonly max: number;
  readonly bands: readonly GaugeBand[];
}

function airZone(band: AirBand): Zone {
  return {
    verdict: AIR_BAND_LABELS[band],
    tone: AIR_BAND_TONE[band],
    colour: AIR_BAND_COLOUR[band],
    accent: AIR_BAND_COLOUR[band],
  };
}

const TEMPERATURE: Bands = {
  min: 10,
  max: 35,
  floor: { verdict: 'Cool', tone: 'warning', colour: 'temp-cool', accent: 'temp-cool' },
  steps: [
    {
      from: 19,
      inclusive: true,
      verdict: 'Comfortable',
      tone: 'positive',
      colour: 'positive',
      accent: 'temp-warm',
    },
    {
      from: 25,
      inclusive: false,
      verdict: 'Warm',
      tone: 'warning',
      colour: 'temp-warm',
      accent: 'temp-warm',
    },
  ],
};

const HUMIDITY: Bands = {
  min: 0,
  max: 100,
  floor: { verdict: 'Dry', tone: 'warning', colour: 'warning', accent: 'humidity' },
  steps: [
    {
      from: 35,
      inclusive: true,
      verdict: 'Comfortable',
      tone: 'positive',
      colour: 'humidity',
      accent: 'humidity',
    },
    {
      from: 65,
      inclusive: false,
      verdict: 'Humid',
      tone: 'warning',
      colour: 'warning',
      accent: 'humidity',
    },
  ],
};

const CO2: Bands = {
  min: 400,
  max: 2000,
  floor: { verdict: 'Fresh', tone: 'positive', colour: 'positive', accent: 'viz-6' },
  steps: [
    {
      from: 1000,
      inclusive: false,
      verdict: 'Stuffy',
      tone: 'warning',
      colour: 'warning',
      accent: 'viz-6',
    },
    {
      from: 1200,
      inclusive: false,
      verdict: 'Stuffy',
      tone: 'critical',
      colour: 'critical',
      accent: 'viz-6',
    },
  ],
};

const PM25: Bands = {
  min: 0,
  max: airGauge(PM25_UPPER_BOUNDS).max,
  floor: airZone(AIR_BANDS[0]),
  steps: AIR_BANDS.flatMap((band, index) => {
    const bound = PM25_UPPER_BOUNDS[index - 1];
    return bound === undefined ? [] : [{ ...airZone(band), from: bound[0], inclusive: false }];
  }),
};

export const BANDS: Readonly<Record<ComfortMetric, Bands>> = {
  temperature: TEMPERATURE,
  humidity: HUMIDITY,
  pm25: PM25,
  co2: CO2,
};

function reaches(step: Step, value: number): boolean {
  return value > step.from || (step.inclusive && value === step.from);
}

export function zoneOf(bands: Bands, value: number): Zone {
  return bands.steps.reduce<Zone>(
    (found, step) => (reaches(step, value) ? step : found),
    bands.floor,
  );
}

function isFahrenheit(unit: string | null): boolean {
  return unit?.includes('F') === true;
}

function toCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function comparable(value: number, unit: string | null): number {
  return isFahrenheit(unit) ? toCelsius(value) : value;
}

function identity(value: number): number {
  return value;
}

export function dialOf(bands: Bands, convert: (value: number) => number = identity): DialScale {
  const visible = bands.steps.filter((step) => step.from < bands.max);
  return {
    min: convert(bands.min),
    max: convert(bands.max),
    bands: [bands.floor, ...visible].map((zone, index) => ({
      upTo: convert(visible[index]?.from ?? bands.max),
      colour: zone.colour,
    })),
  };
}

export function dialFor(metric: ComfortMetric, unit: string | null): DialScale {
  return dialOf(BANDS[metric], isFahrenheit(unit) ? toFahrenheit : identity);
}
