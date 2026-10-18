import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useIdiom } from '../../design/platform';
import { useThemeSetting } from '../../design/theme';
import { Skeleton } from '../skeleton';
import { BOARD_COLUMNS } from '@smarteverything/domain';
import { fittedCell, pack, rowsOf } from './packer';
import { cellOf, frameOf } from './board-geometry';
import type { BoardClass, BoardWidget } from './types';

export function SkeletonBoard({
  board,
  widgets,
  aspectOf,
}: {
  readonly board: BoardClass;
  readonly widgets: readonly BoardWidget[];
  readonly aspectOf?: (type: string) => number | undefined;
}): ReactNode {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const [width, setWidth] = useState(0);
  const base = cellOf(width, BOARD_COLUMNS[board], idiom, density);
  const cell = aspectOf === undefined ? base : fittedCell(board, widgets, { cell: base, aspectOf });
  const placements = pack(board, widgets, aspectOf === undefined ? undefined : { cell, aspectOf });
  const rows = rowsOf(placements);
  const box = { height: rows * cell.height + Math.max(0, rows - 1) * cell.gap };
  return (
    <View
      style={box}
      accessibilityLabel="Loading"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {width === 0
        ? null
        : placements.map((placement) => (
            <View key={placement.widget.key} style={frameOf(cell, placement)} className="absolute">
              <Skeleton shape="tile" className="h-full" />
            </View>
          ))}
    </View>
  );
}
