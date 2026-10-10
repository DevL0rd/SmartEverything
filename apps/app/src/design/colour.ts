import { useResolveClassNames } from 'uniwind';
import { isNative } from './platform';
import type { ColourRole } from './tokens';

class MissingTokenError extends Error {
  override readonly name = 'MissingTokenError';

  constructor(readonly token: string) {
    super(`The design token ${token} is not defined in global.css.`);
  }
}

class InvalidColourError extends Error {
  override readonly name = 'InvalidColourError';

  constructor(readonly written: string) {
    super(`Expected a #RRGGBB colour, received ${written}.`);
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new InvalidColourError(hex);
  }
  const [, red = '', green = '', blue = ''] = match;
  return `rgba(${String(parseInt(red, 16))}, ${String(parseInt(green, 16))}, ${String(parseInt(blue, 16))}, ${String(alpha)})`;
}

const ACCENT_CLASS: Readonly<Record<ColourRole, string>> = {
  bg: 'accent-bg',
  'surface-1': 'accent-surface-1',
  'surface-2': 'accent-surface-2',
  'surface-3': 'accent-surface-3',
  'surface-raised': 'accent-surface-raised',
  chrome: 'accent-chrome',
  'on-surface': 'accent-on-surface',
  'on-surface-variant': 'accent-on-surface-variant',
  'on-surface-faint': 'accent-on-surface-faint',
  outline: 'accent-outline',
  'outline-variant': 'accent-outline-variant',
  scrim: 'accent-scrim',
  primary: 'accent-primary',
  'on-primary': 'accent-on-primary',
  'primary-container': 'accent-primary-container',
  'on-primary-container': 'accent-on-primary-container',
  positive: 'accent-positive',
  warning: 'accent-warning',
  critical: 'accent-critical',
  info: 'accent-info',
  focus: 'accent-focus',
  'viz-1': 'accent-viz-1',
  'viz-2': 'accent-viz-2',
  'viz-3': 'accent-viz-3',
  'viz-4': 'accent-viz-4',
  'viz-5': 'accent-viz-5',
  'viz-6': 'accent-viz-6',
  'air-good': 'accent-air-good',
  'air-fair': 'accent-air-fair',
  'air-moderate': 'accent-air-moderate',
  'air-poor': 'accent-air-poor',
  'air-bad': 'accent-air-bad',
  'air-severe': 'accent-air-severe',
  'temp-warm': 'accent-temp-warm',
  'temp-cool': 'accent-temp-cool',
  humidity: 'accent-humidity',
  move: 'accent-move',
  exercise: 'accent-exercise',
  stand: 'accent-stand',
  heart: 'accent-heart',
  'sleep-deep': 'accent-sleep-deep',
  'sleep-core': 'accent-sleep-core',
  'sleep-rem': 'accent-sleep-rem',
  'sleep-awake': 'accent-sleep-awake',
};

export function useColour(role: ColourRole): string {
  const native = isNative();
  const { accentColor } = useResolveClassNames(native ? ACCENT_CLASS[role] : '');
  if (!native) {
    return `var(--color-${role})`;
  }
  if (typeof accentColor !== 'string') {
    throw new MissingTokenError(`--color-${role}`);
  }
  return accentColor;
}
