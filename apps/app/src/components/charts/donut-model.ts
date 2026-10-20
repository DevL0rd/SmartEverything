import type { ColourRole } from '../../design/tokens';

export interface DonutSlice {
  readonly key: string;
  readonly value: number;
  readonly colour: ColourRole;
  readonly label: string;
}

export interface DonutArc {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly share: number;
  readonly colour: ColourRole;
  readonly label: string;
}

const FULL_TURN = 360;
const GAP_DEGREES = 3;

export function donutArcs(slices: readonly DonutSlice[]): DonutArc[] {
  const positive = slices.filter((slice) => slice.value > 0);
  const total = positive.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) return [];
  const gap = positive.length > 1 ? GAP_DEGREES : 0;
  let cursor = 0;
  return positive.map((slice) => {
    const share = slice.value / total;
    const sweep = share * FULL_TURN;
    const from = cursor + gap / 2;
    const to = Math.max(from, cursor + sweep - gap / 2);
    cursor += sweep;
    return { key: slice.key, from, to, share, colour: slice.colour, label: slice.label };
  });
}

export function donutSummary(arcs: readonly DonutArc[]): string {
  if (arcs.length === 0) return 'No data';
  return arcs
    .map((arc) => `${arc.label} ${String(Math.round(arc.share * 100))} percent`)
    .join(', ');
}
