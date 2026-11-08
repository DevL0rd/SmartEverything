import { SEMANTIC_SIZES, type Density, type Idiom } from '../design/tokens';

export type GridGap = 'grid' | 'tight';

const TIGHT_GAP = 8;

export interface GridLayout {
  readonly columns: number;
  readonly cellWidth: number;
}

interface GridLayoutInput {
  readonly width: number;
  readonly minItemWidth: number;
  readonly maxColumns: number;
  readonly gap: GridGap;
  readonly idiom: Idiom;
  readonly density: Density;
}

export function gridLayoutOf({
  width,
  minItemWidth,
  maxColumns,
  gap,
  idiom,
  density,
}: GridLayoutInput): GridLayout {
  const spacing = gap === 'grid' ? SEMANTIC_SIZES[idiom][density].gridGap : TIGHT_GAP;
  const columns = Math.max(
    1,
    Math.min(maxColumns, Math.floor((width + spacing) / (minItemWidth + spacing))),
  );
  return { columns, cellWidth: (width - spacing * (columns - 1)) / columns };
}
