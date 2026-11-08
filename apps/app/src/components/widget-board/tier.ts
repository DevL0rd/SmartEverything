import { WIDGET_FOOTPRINTS, WIDGET_SIZES, type WidgetSize } from '@smarteverything/domain';
import { SEMANTIC_SIZES, type Density, type Idiom } from '../../design/tokens';

const IDIOMS: readonly Idiom[] = ['touch', 'pointer'];
const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

export function tierRows(size: WidgetSize): number {
  return WIDGET_FOOTPRINTS.compact[size].rows;
}

export function tierHeight(size: WidgetSize, idiom: Idiom, density: Density): number {
  const { rowUnit, gridGap } = SEMANTIC_SIZES[idiom][density];
  const rows = tierRows(size);
  return rows * rowUnit + (rows - 1) * gridGap;
}

export function tierInnerHeight(size: WidgetSize, idiom: Idiom, density: Density): number {
  return tierHeight(size, idiom, density) - 2 * SEMANTIC_SIZES[idiom][density].cardPad;
}

function shortestInner(): number {
  const heights = WIDGET_SIZES.flatMap((size) =>
    IDIOMS.flatMap((idiom) => DENSITIES.map((density) => tierInnerHeight(size, idiom, density))),
  );
  return Math.min(...heights);
}

export const SHORTEST_TIER_INNER = shortestInner();
