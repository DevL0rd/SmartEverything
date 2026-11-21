import { useContext } from 'react';
import { controlHitSlop, type Density, type Idiom } from '../../design/tokens';
import { InBand } from './in-band';

export interface Band {
  readonly slop: number | undefined;
  readonly compact: boolean;
}

export const BandMember = InBand;

export function bandValueOf(idiom: Idiom, density: Density, compact: boolean): Band {
  const slop = controlHitSlop(idiom, density);
  return { slop: slop > 0 ? slop : undefined, compact };
}

export function useBand(): Band | null {
  return useContext(InBand);
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
