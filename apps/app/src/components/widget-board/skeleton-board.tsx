import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useIdiom } from '../../design/platform';
import { useThemeSetting } from '../../design/theme';
import { Skeleton } from '../skeleton';
import { boardHeightOf, pack } from './packer';
import { boardColumnsOf, cellOf, frameOf } from './board-geometry';
import type { BoardClass, BoardWidget } from './types';

export function SkeletonBoard({
  board,
  widgets,
}: {
  readonly board: BoardClass;
  readonly widgets: readonly BoardWidget[];
}): ReactNode {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const [width, setWidth] = useState(0);
  const columns = boardColumnsOf(board, width);
  const cell = cellOf(width, columns, idiom, density);
  const placements = pack(board, widgets, columns);
  const box = { height: boardHeightOf(placements, cell) };
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
