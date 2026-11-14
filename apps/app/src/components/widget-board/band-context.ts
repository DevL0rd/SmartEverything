import { createContext, use } from 'react';
import { useIdiom } from '../../design/platform';
import { useThemeSetting } from '../../design/theme';
import { controlHitSlop } from '../../design/tokens';

export interface Band {
  readonly slop: number | undefined;
  readonly compact: boolean;
}

const InBand = createContext<Band | null>(null);

export const BandMember = InBand;

export function useBandValue(compact: boolean): Band {
  const slop = controlHitSlop(useIdiom(), useThemeSetting('density'));
  return { slop: slop > 0 ? slop : undefined, compact };
}

export function useBand(): Band | null {
  return use(InBand);
}

export function useInActionBand(): boolean {
  return useBand() !== null;
}

export function useCompactBand(): boolean {
  return useBand()?.compact === true;
}

export function bandHitSlop(band: Band | null, controlHeight: boolean): number | undefined {
  return band !== null && controlHeight ? band.slop : undefined;
}

export function useBandHitSlop(controlHeight: boolean): number | undefined {
  return bandHitSlop(useBand(), controlHeight);
}
