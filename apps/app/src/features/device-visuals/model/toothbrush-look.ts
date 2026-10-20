import type {
  BrushBrand,
  BrushHeadType,
  BrushIntensity,
  BrushPressure,
} from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

export const HEAD_COLOUR: Readonly<Record<BrushHeadType | 'none', ColourRole>> = {
  clean: 'viz-blue',
  white: 'on-surface',
  gums: 'viz-4',
  tongue: 'viz-5',
  all_in_one: 'viz-1',
  sensitive: 'viz-magenta',
  other: 'on-surface-variant',
  none: 'on-surface-faint',
};

export const HALO_COLOUR: Readonly<
  Record<BrushBrand, Readonly<Record<BrushPressure, ColourRole | null>>>
> = {
  sonicare: { no_contact: null, optimal: 'positive', too_high: 'viz-violet' },
  oralb: { no_contact: null, optimal: 'positive', too_high: 'critical' },
};

export const SHIMMER_MS: Readonly<Record<BrushIntensity | 'none', number>> = {
  none: 160,
  low: 220,
  medium: 160,
  high: 110,
};

export const WEAR_WARN = 0.9;

export const WEAR_DUE = 1;

export function wearRole(wear: number): ColourRole {
  if (wear >= WEAR_DUE) {
    return 'critical';
  }
  return wear >= WEAR_WARN ? 'warning' : 'positive';
}
