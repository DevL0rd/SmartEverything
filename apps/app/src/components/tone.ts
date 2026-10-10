import type { ColourRole } from '../design/tokens';

export type Tone =
  | 'default'
  | 'variant'
  | 'faint'
  | 'primary'
  | 'positive'
  | 'warning'
  | 'critical'
  | 'info'
  | 'onPrimary';

export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  default: 'text-on-surface',
  variant: 'text-on-surface-variant',
  faint: 'text-on-surface-faint',
  primary: 'text-primary',
  positive: 'text-positive',
  warning: 'text-warning',
  critical: 'text-critical',
  info: 'text-info',
  onPrimary: 'text-on-primary',
};

export const TONE_ROLE: Readonly<Record<Tone, ColourRole>> = {
  default: 'on-surface',
  variant: 'on-surface-variant',
  faint: 'on-surface-faint',
  primary: 'primary',
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  info: 'info',
  onPrimary: 'on-primary',
};

export type StatusTone = 'info' | 'positive' | 'warning' | 'critical';

export const STATUS_CONTAINER: Readonly<Record<StatusTone, string>> = {
  info: 'bg-info/12',
  positive: 'bg-positive/12',
  warning: 'bg-warning/14',
  critical: 'bg-critical/14',
};

export const STATUS_FILL: Readonly<Record<StatusTone, string>> = {
  info: 'bg-info',
  positive: 'bg-positive',
  warning: 'bg-warning',
  critical: 'bg-critical',
};
