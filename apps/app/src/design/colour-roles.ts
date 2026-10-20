import { createContext } from 'react';
import type { ColourRole } from './tokens';

export type Palette = Readonly<Record<ColourRole, string>>;

export class MissingTokenError extends Error {
  override readonly name = 'MissingTokenError';

  constructor(readonly token: string) {
    super(`The design token ${token} is not defined in global.css.`);
  }
}

export class MissingPaletteError extends Error {
  override readonly name = 'MissingPaletteError';

  constructor(readonly role: ColourRole) {
    super(`The colour ${role} was read outside a ColourPalette.`);
  }
}

export const COLOUR_VARIABLE = {
  bg: '--color-bg',
  'surface-1': '--color-surface-1',
  'surface-2': '--color-surface-2',
  'surface-3': '--color-surface-3',
  'surface-raised': '--color-surface-raised',
  chrome: '--color-chrome',
  'on-surface': '--color-on-surface',
  'on-surface-variant': '--color-on-surface-variant',
  'on-surface-faint': '--color-on-surface-faint',
  outline: '--color-outline',
  'outline-variant': '--color-outline-variant',
  scrim: '--color-scrim',
  primary: '--color-primary',
  'on-primary': '--color-on-primary',
  'primary-container': '--color-primary-container',
  'on-primary-container': '--color-on-primary-container',
  'orb-shine': '--color-orb-shine',
  positive: '--color-positive',
  warning: '--color-warning',
  caution: '--color-caution',
  critical: '--color-critical',
  info: '--color-info',
  focus: '--color-focus',
  'viz-1': '--color-viz-1',
  'viz-2': '--color-viz-2',
  'viz-3': '--color-viz-3',
  'viz-4': '--color-viz-4',
  'viz-5': '--color-viz-5',
  'viz-6': '--color-viz-6',
  'viz-blue': '--color-viz-blue',
  'viz-magenta': '--color-viz-magenta',
  'viz-violet': '--color-viz-violet',
  'viz-green': '--color-viz-green',
  'air-good': '--color-air-good',
  'air-fair': '--color-air-fair',
  'air-moderate': '--color-air-moderate',
  'air-poor': '--color-air-poor',
  'air-bad': '--color-air-bad',
  'air-severe': '--color-air-severe',
  'temp-warm': '--color-temp-warm',
  'temp-cool': '--color-temp-cool',
  humidity: '--color-humidity',
  'laundry-cool': '--color-laundry-cool',
  'laundry-warm': '--color-laundry-warm',
  'laundry-rinse': '--color-laundry-rinse',
  move: '--color-move',
  exercise: '--color-exercise',
  stand: '--color-stand',
  heart: '--color-heart',
  'sleep-deep': '--color-sleep-deep',
  'sleep-core': '--color-sleep-core',
  'sleep-rem': '--color-sleep-rem',
  'sleep-awake': '--color-sleep-awake',
  'sleep-asleep': '--color-sleep-asleep',
  'sleep-on-asleep': '--color-sleep-on-asleep',
  'sleep-band': '--color-sleep-band',
  track: '--color-track',
  'temp-neutral': '--color-temp-neutral',
} as const satisfies Readonly<Record<ColourRole, string>>;

function rolesOf<K extends string>(record: Readonly<Record<K, string>>): readonly K[] {
  const roles: K[] = [];
  for (const role in record) {
    roles.push(role);
  }
  return roles;
}

export function colourVariable(role: ColourRole): string {
  return COLOUR_VARIABLE[role];
}

export const COLOUR_ROLES: readonly ColourRole[] = rolesOf(COLOUR_VARIABLE);

export const COLOUR_VARIABLES: string[] = COLOUR_ROLES.map(colourVariable);

export const PaletteContext = createContext<Palette | null>(null);
