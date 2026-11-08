import type { ComponentType, ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { frameOf, type Cell } from './board-geometry';
import type { Placement } from './packer';

export type BoardRowLayer = ComponentType<{
  readonly style: ViewStyle;
  readonly children: ReactNode;
}>;

interface RowLayer {
  readonly row: number;
  readonly top: number;
  readonly height: number;
  readonly placements: readonly Placement[];
}

export function rowLayersOf(placements: readonly Placement[], cell: Cell): readonly RowLayer[] {
  const groups = new Map<
    number,
    { row: number; top: number; height: number; placements: Placement[] }
  >();
  for (const placement of placements) {
    const { top, height } = frameOf(cell, placement);
    const { row } = placement;
    const group = groups.get(row);
    if (group === undefined) {
      groups.set(row, { row, top, height, placements: [placement] });
    } else {
      group.height = Math.max(height, group.height);
      group.placements.push(placement);
    }
  }
  return [...groups.values()];
}

export function BoardRowLayers({
  placements,
  cell,
  layer: Layer,
  render,
}: {
  readonly placements: readonly Placement[];
  readonly cell: Cell;
  readonly layer: BoardRowLayer;
  readonly render: (placement: Placement, top: number) => ReactNode;
}): ReactNode {
  return rowLayersOf(placements, cell).map(({ top, height, placements: members }) => {
    const style = { position: 'absolute', left: 0, right: 0, top, height } as const;
    const key = JSON.stringify(members.map(({ widget }) => widget.key));
    return (
      <Layer key={key} style={style}>
        {members.map((placement) => render(placement, top))}
      </Layer>
    );
  });
}
