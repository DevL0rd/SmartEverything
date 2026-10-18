import type { ReactNode } from 'react';
import { CardGrid as KitCardGrid } from '../../../components/card-grid';
import { gridColumnsOf } from '../../../components/frame-layout';
import { useAreaWidth } from '../../../design/size-class';
import { bodyWidthOf } from '../model/sections';

export function columnsOfArea(area: number): 1 | 2 {
  return gridColumnsOf(bodyWidthOf(area)) === 1 ? 1 : 2;
}

export function CardGrid<T>({
  items,
  keyOf,
  render,
}: {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly render: (item: T) => ReactNode;
}): ReactNode {
  return (
    <KitCardGrid
      items={items}
      columns={columnsOfArea(useAreaWidth())}
      keyOf={keyOf}
      render={render}
    />
  );
}
