import type { ReactNode } from 'react';
import { CardGrid as KitCardGrid } from '../../../components/card-grid';
import { gridColumnsOf } from '../../../components/frame-layout';
import { useFrameBodyWidth } from '../../../components/section-body';

function columnsOfBody(bodyWidth: number): 1 | 2 {
  return gridColumnsOf(bodyWidth) === 1 ? 1 : 2;
}

export function PhoneCardGrid<T>({
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
      columns={columnsOfBody(useFrameBodyWidth())}
      keyOf={keyOf}
      render={render}
    />
  );
}
