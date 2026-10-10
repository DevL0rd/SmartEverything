import type { AirBand } from '@smarteverything/domain';
import type { ColourRole } from './tokens';

export const AIR_BAND_COLOUR: Readonly<Record<AirBand, ColourRole>> = {
  good: 'air-good',
  fair: 'air-fair',
  moderate: 'air-moderate',
  poor: 'air-poor',
  bad: 'air-bad',
  severe: 'air-severe',
};
