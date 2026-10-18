import type { AirBand } from '@smarteverything/domain';
import { AIR_BAND_COLOUR } from '../design/data-colours';
import type { GaugeBand } from './charts';
import type { StatusTone } from './tone';

export const AIR_BAND_TONE: Readonly<Record<AirBand, StatusTone>> = {
  good: 'positive',
  fair: 'positive',
  moderate: 'warning',
  poor: 'critical',
  bad: 'critical',
  severe: 'critical',
};

export const US_AQI_BAND_TONE: Readonly<Record<AirBand, StatusTone>> = {
  ...AIR_BAND_TONE,
  fair: 'warning',
};

interface AirGauge {
  readonly max: number;
  readonly bands: readonly GaugeBand[];
}

export function airGauge(bounds: readonly (readonly [number, AirBand, ...string[]])[]): AirGauge {
  return {
    max: bounds.reduce((largest, [upTo]) => Math.max(largest, upTo), 0),
    bands: bounds.map(([upTo, band]) => ({ upTo, colour: AIR_BAND_COLOUR[band] })),
  };
}
