import type { AirBand, PlannerColourKey } from '@smarteverything/domain';
import type { ColourRole } from './tokens';

export const AIR_BAND_COLOUR: Readonly<Record<AirBand, ColourRole>> = {
  good: 'air-good',
  fair: 'air-fair',
  moderate: 'air-moderate',
  poor: 'air-poor',
  bad: 'air-bad',
  severe: 'air-severe',
};

export const CALENDAR_COLOUR: Readonly<Record<PlannerColourKey, ColourRole>> = {
  work: 'viz-6',
  family: 'viz-1',
  personal: 'viz-3',
  health: 'positive',
  home: 'viz-4',
  shopping: 'viz-5',
};
