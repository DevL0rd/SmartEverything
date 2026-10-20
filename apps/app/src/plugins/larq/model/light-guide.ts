import type { ColourRole } from '../../../design/tokens';

export interface LightMeaning {
  readonly colour: ColourRole;
  readonly pattern: string;
  readonly meaning: string;
}

export const LIGHT_GUIDE: readonly LightMeaning[] = [
  {
    colour: 'viz-violet',
    pattern: 'Breathing',
    meaning: 'A UV clean is running inside the bottle.',
  },
  { colour: 'info', pattern: 'Flashing', meaning: 'A drink reminder. Take a sip.' },
  { colour: 'positive', pattern: 'Breathing', meaning: 'Charging.' },
  { colour: 'positive', pattern: 'Steady', meaning: 'Fully charged.' },
  {
    colour: 'warning',
    pattern: 'Blinking',
    meaning: 'The cap is off a bottle, the liquid is too hot, or the battery is low.',
  },
  { colour: 'critical', pattern: 'Blinking', meaning: 'A fault. Open Care for its name.' },
  { colour: 'on-surface-variant', pattern: 'Steady', meaning: 'Travel Lock is on.' },
];
