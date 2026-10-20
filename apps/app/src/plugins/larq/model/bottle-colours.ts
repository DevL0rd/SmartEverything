import type { ColourRole } from '../../../design/tokens';

export const SOURCE_COLOUR = {
  bottle: 'humidity',
  logged: 'viz-2',
  other: 'on-surface-variant',
} as const satisfies Readonly<Record<string, ColourRole>>;

export const SOURCE_LABEL = {
  bottle: 'Bottle',
  logged: 'Logged here',
  other: 'Other apps',
} as const;

export const UV_COLOUR = {
  normal: 'viz-violet',
  adventure: 'viz-1',
  maintenance: 'on-surface-variant',
} as const satisfies Readonly<Record<string, ColourRole>>;

export const UV_LABEL = {
  normal: 'Normal',
  adventure: 'Adventure',
  maintenance: 'Self-clean',
} as const;

export const WATER_COLOUR: ColourRole = 'humidity';

export const FILL_COLOUR: ColourRole = 'viz-1';

export const PACE_COLOUR: ColourRole = 'viz-2';

export const GOAL_COLOUR: ColourRole = 'positive';

export const BATTERY_COLOUR: ColourRole = 'viz-5';
