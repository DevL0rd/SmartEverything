import type { Idiom, SemanticSizes } from '../../../design/tokens';
import { FIXED_PX } from '../../device-visuals';

export const TILE_LANE_GAP = 12;

const BAND_GAP = 8;

const BAND_SLOTS = 2;

export const TILE_MIN_HEIGHT: Readonly<Record<Idiom, number>> = { touch: 132, pointer: 120 };

export interface DeviceTileGrid {
  readonly columns: number;
  readonly gap: number;
  readonly minRow: number;
}

export function deviceTileMinWidth(sizes: SemanticSizes): number {
  return (
    2 * sizes.cardPad +
    FIXED_PX.tile +
    TILE_LANE_GAP +
    BAND_SLOTS * sizes.controlH +
    (BAND_SLOTS - 1) * BAND_GAP
  );
}

export function deviceTileGrid({
  width,
  idiom,
  sizes,
  count,
}: {
  readonly width: number;
  readonly idiom: Idiom;
  readonly sizes: SemanticSizes;
  readonly count: number;
}): DeviceTileGrid {
  const gap = sizes.gridGap;
  const fits = Math.floor((width + gap) / (deviceTileMinWidth(sizes) + gap));
  return {
    columns: Math.max(1, Math.min(fits, count)),
    gap,
    minRow: TILE_MIN_HEIGHT[idiom],
  };
}
